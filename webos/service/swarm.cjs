'use strict';
// Live seeder counts from public UDP trackers (BEP 15 scrape).
//
// Torrent indexes report stale seeder counts: a source listed with 617
// seeders had 1 live seeder, while one listed with 109 had 97. Asking the
// trackers before choosing a source lets the TV start on a live swarm instead
// of waiting on dead ones. Only counts are requested; nothing is downloaded.
const dgram = require('dgram');
const dns = require('dns');
const crypto = require('crypto');

const TRACKERS = [['tracker.opentrackr.org', 1337], ['open.tracker.cl', 1337]];
const PER_PACKET = 70, TIMEOUT = 5000, TTL = 10 * 60 * 1000;
const cache = new Map();

function lookup(host) {
  return new Promise((resolve, reject) => dns.lookup(host, 4, (error, address) => error ? reject(error) : resolve(address)));
}

function scrapeTracker(host, port, hashes) {
  return lookup(host).then(address => new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    const transaction = crypto.randomBytes(4);
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); try { socket.close(); } catch (error) { /* already closed */ } resolve(result); };
    const timer = setTimeout(() => finish(undefined), TIMEOUT);
    socket.on('error', () => finish(undefined));
    socket.on('message', message => {
      if (message.length < 8 || !message.slice(4, 8).equals(transaction)) return;
      const action = message.readUInt32BE(0);
      if (action === 0 && message.length >= 16) {
        const request = Buffer.concat([message.slice(8, 16), Buffer.from([0, 0, 0, 2]), transaction].concat(hashes.map(hash => Buffer.from(hash, 'hex'))));
        socket.send(request, port, address);
      } else if (action === 2) {
        const counts = {};
        hashes.forEach((hash, index) => { const offset = 8 + index * 12; if (offset + 4 <= message.length) counts[hash] = message.readUInt32BE(offset); });
        finish(counts);
      } else finish(undefined);
    });
    // Connect: protocol id 0x41727101980 written as two 32-bit halves (no BigInt on Node 8).
    const connect = Buffer.alloc(16);
    connect.writeUInt32BE(0x417, 0); connect.writeUInt32BE(0x27101980, 4); connect.writeUInt32BE(0, 8); transaction.copy(connect, 12);
    socket.send(connect, port, address);
  })).catch(() => undefined);
}

/** Live seeders per info hash (lowercase hex). Missing hashes could not be checked. */
async function liveSeeders(input) {
  const hashes = Array.from(new Set((input || []).map(hash => String(hash).toLowerCase()).filter(hash => /^[a-f\d]{40}$/.test(hash)))).slice(0, 140);
  const now = Date.now(), result = {}, missing = [];
  for (const hash of hashes) { const hit = cache.get(hash); if (hit && now - hit.at < TTL) result[hash] = hit.seeders; else missing.push(hash); }
  const batches = [];
  for (let index = 0; index < missing.length; index += PER_PACKET) batches.push(missing.slice(index, index + PER_PACKET));
  await Promise.all(batches.map(async batch => {
    // Use the first tracker that answers; give the other 600 ms more instead
    // of its full timeout, so Play is not held up by an unreachable tracker.
    const answers = await new Promise(resolve => {
      const collected = [];let settled = 0, grace;
      const done = () => { clearTimeout(grace); resolve(collected); };
      TRACKERS.forEach(([host, port]) => scrapeTracker(host, port, batch).then(answer => {
        settled++;
        if (answer) { collected.push(answer); if (!grace) grace = setTimeout(done, 600); }
        if (settled === TRACKERS.length) done();
      }));
    });
    for (const hash of batch) {
      const counts = answers.filter(Boolean).map(answer => answer[hash]).filter(count => typeof count === 'number');
      if (!counts.length) continue;
      const seeders = Math.max.apply(null, counts);
      cache.set(hash, {seeders, at:now});
      result[hash] = seeders;
    }
  }));
  if (cache.size > 2000) cache.clear();
  return result;
}

module.exports = {liveSeeders};
