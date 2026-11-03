'use strict';
const crypto = require('crypto');
const WebTorrent = require('webtorrent');
const Piece = require('torrent-piece');
const createBoundedStore = require('./bounded-store.cjs');

const MiB = 1024 * 1024;
const trackers = ['udp://tracker.opentrackr.org:1337/announce', 'udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce'];
const videoType = name => /\.mkv$/i.test(name) ? 'video/x-matroska' : /\.webm$/i.test(name) ? 'video/webm' : /\.ts$/i.test(name) ? 'video/mp2t' : 'video/mp4';

module.exports = function createTorrents(options) {
  let active, client, starting = Promise.resolve();
  const limit = () => options.cacheMiB() * MiB;
  const fail = message => { throw new Error(message); };
  const snapshot = session => ({
    id:session.id, state:session.error ? 'error' : session.ready ? 'ready' : 'buffering', error:session.error,
    files:session.files || [], selected:session.selected, numPeers:session.torrent ? session.torrent.numPeers : 0,
    downloadSpeed:session.torrent ? session.torrent.downloadSpeed : 0,
    downloaded:session.torrent ? session.torrent.downloaded : 0, progress:session.torrent ? session.torrent.progress : 0,
    cacheBytes:session.store ? session.store.bytes : 0, cacheLimit:limit(), nativePlayback:true,
    mediaUrl:session.ready && session.selected != null ? '/api/torrents/' + session.id + '/files/' + session.selected : undefined,
    audioTracks:[], subtitleTracks:[]
  });
  function get(id) {
    if (!active || active.id !== id) fail('This playback session has ended.');
    active.touched = Date.now();
    return active;
  }
  async function stop() {
    const session = active;
    active = undefined;
    if (session) {
      clearTimeout(session.timer);
      session.readers.forEach(reader => reader.cancel());
    }
    const previous = client;
    client = undefined;
    if (previous && !previous.destroyed) await new Promise(resolve => previous.destroy(resolve));
    if (session && session.store) session.store.close();
  }
  function choose(session, index) {
    if (!Number.isInteger(index) || !session.files.some(file => file.index === index)) fail('Choose a supported video file.');
    session.readers.forEach(reader => reader.cancel());
    session.selected = index;
    return snapshot(session);
  }
  async function begin(input) {
    if (!/^[a-f\d]{40}$/i.test(input.infoHash || '')) fail('A valid torrent info hash is required.');
    await stop();
    const session = active = {id:crypto.randomBytes(18).toString('hex'), touched:Date.now(), readers:new Set(), ready:false};
    // TCP/UDP/DHT only. No WebRTC native addons and no filesystem store.
    client = new WebTorrent({maxConns:8, tracker:{wrtc:false}, dht:{maxTables:16,maxValues:32,maxPeers:128}});
    client.on('error', () => { session.error = 'The TV torrent service could not connect. Choose another source.'; });
    const Store = createBoundedStore(limit(), index => {
      const torrent = session.torrent;
      if (!torrent || torrent.destroyed || !torrent.bitfield || !torrent.bitfield.get(index)) return;
      torrent.bitfield.set(index, false);
      torrent.pieces[index] = new Piece(index === torrent.pieces.length - 1 ? torrent.lastPieceLength : torrent.pieceLength);
      torrent._reservations[index] = [];
      torrent.done = false;
      torrent.files.forEach(file => { file.done = false; });
    }, store => { session.store = store; });
    const torrent = session.torrent = client.add('magnet:?xt=urn:btih:' + input.infoHash.toLowerCase(), {store:Store, announce:trackers, strategy:'sequential'});
    torrent.on('error', error => { session.error = error.message; });
    torrent.once('metadata', () => {
      // Bound metadata bookkeeping as well as completed piece data.
      if (torrent.pieces.length > 32768 || torrent.files.length > 1000) {
        session.error = 'This torrent is too large for the TV. Choose a single-video source.';
        torrent.destroy();
      }
    });
    torrent.once('ready', () => {
      if (active !== session || torrent.destroyed) return;
      clearTimeout(session.timer);
      // WebTorrent initially selects everything; clear it before any playback
      // read. Only the small HTTP read windows below may request pieces.
      torrent.deselect(0, torrent.pieces.length - 1, 0);
      torrent.files.forEach(file => file.deselect());
      session.files = torrent.files.map((file, index) => ({index, name:file.name, length:file.length})).filter(file => /\.(mp4|m4v|mkv|webm|mov|ts)$/i.test(file.name));
      if (!session.files.length) { session.error = 'This torrent contains no supported videos.'; return; }
      const episode = /:(\d+):(\d+)$/.exec(input.videoId || '');
      const exact = episode && new RegExp('(?:s0*' + Number(episode[1]) + '[ ._-]*e0*' + Number(episode[2]) + '(?!\\d)|\\b' + Number(episode[1]) + 'x0*' + Number(episode[2]) + '(?!\\d))', 'i');
      const match = exact && session.files.find(file => exact.test(file.name));
      const explicit = session.files.find(file => file.index === input.fileIdx);
      session.selected = explicit ? explicit.index : match ? match.index : session.files.length === 1 ? session.files[0].index : undefined;
      session.ready = true;
    });
    session.timer = setTimeout(() => {
      if (!session.ready && active === session) { session.error = 'No torrent metadata arrived. Try a source with more seeders.'; if (!torrent.destroyed) torrent.destroy(); }
    }, 90000);
    return snapshot(session);
  }
  function start(input) {
    const task = starting.then(() => begin(input));
    starting = task.catch(() => {});
    return task;
  }
  function serve(session, index, req, res) {
    if (!session.ready || index !== session.selected) fail('Select a video before playing it.');
    if (session.readers.size >= 3) { res.writeHead(429); res.end(); return; }
    const torrent = session.torrent, file = torrent.files[index], size = file.length;
    const match = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    let start = 0, end = size - 1;
    if (req.headers.range) {
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, {'Content-Range':'bytes */' + size}); res.end(); return; }
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { res.writeHead(416, {'Content-Range':'bytes */' + size}); res.end(); return; }
    }
    const headers = {'Content-Type':videoType(file.name), 'Content-Length':end - start + 1, 'Accept-Ranges':'bytes', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
    if (match) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
    res.writeHead(match ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    let position = start, selection, waiting, timeout, cancelled = false;
    const reader = {cancel:() => finish(true)};
    session.readers.add(reader);
    function unselect() { if (selection && !torrent.destroyed) torrent.deselect(selection[0], selection[1], selection[2]); selection = undefined; }
    function finish(destroy) {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timeout);
      clearTimeout(waiting);
      unselect();
      session.readers.delete(reader);
      if (destroy && !res.finished) res.destroy();
    }
    function pump() {
      if (cancelled || torrent.destroyed || active !== session) return finish(true);
      session.touched = Date.now();
      if (position > end) { res.end(); return finish(false); }
      const absolute = file.offset + position, piece = Math.floor(absolute / torrent.pieceLength);
      if (!selection || piece !== selection[0]) {
        unselect();
        const ahead = Math.max(1, Math.floor(4 * MiB / torrent.pieceLength));
        selection = [piece, Math.min(torrent.pieces.length - 1, Math.floor((file.offset + end) / torrent.pieceLength), piece + ahead), 10];
        torrent.select(selection[0], selection[1], selection[2]);
      }
      if (!torrent.bitfield.get(piece)) {
        waiting = setTimeout(pump, 150);
        return;
      }
      session.store.get(piece, (error, buffer) => {
        if (cancelled) return;
        if (error) { waiting = setTimeout(pump, 50); return; }
        clearTimeout(timeout);
        timeout = setTimeout(() => finish(true), 45000);
        const offset = absolute % torrent.pieceLength;
        // Small writes honor the native player's backpressure; never assemble
        // a movie, or let a slow player queue an entire 4 MB torrent piece.
        const length = Math.min(64 * 1024, buffer.length - offset, end - position + 1);
        position += length;
        if (res.write(buffer.slice(offset, offset + length))) setImmediate(pump);
        else res.once('drain', pump);
      });
    }
    timeout = setTimeout(() => finish(true), 45000);
    res.once('close', () => finish(false));
    pump();
  }
  const reap = setInterval(() => { if (active && Date.now() - active.touched > 90000) void stop(); }, 15000);
  reap.unref();
  return {start, stop, get, choose, snapshot, serve, stats:() => ({bytes:active && active.store ? active.store.bytes : 0, limit:limit(), active:Boolean(active)}), close:async() => { clearInterval(reap); await stop(); }};
};
