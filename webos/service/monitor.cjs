'use strict';
const crypto = require('crypto');

// A small in-memory flight recorder. No polling of providers, media downloads,
// titles, source URLs or persistent log files on the TV.
module.exports = function createMonitor(version, read) {
  const boot = crypto.randomBytes(6).toString('hex'), startedAt = Date.now();
  const events = [], counters = {errors:0, warnings:0, requestsFailed:0, downloads:0, cleanups:0};
  let sequence = 0, ui, lastTick = Date.now(), lagMs = 0, stalledSince = 0, stalledSession;
  let lastReceived = 0, lastServed = 0;
  const conditions = new Set();
  const clean = value => String(value || '').replace(/(?:https?:\/\/|magnet:)[^\s]+/gi,'[source]').replace(/[\r\n\t]+/g,' ').slice(0,180);
  function record(level, code, message) {
    const text = clean(message), previous = events[events.length - 1];
    if (level === 'error') counters.errors++;
    if (level === 'warning') counters.warnings++;
    if (previous && previous.code === code && previous.message === text && Date.now() - previous.at < 30000) {
      previous.count++; previous.at = Date.now(); return;
    }
    events.push({id:++sequence, at:Date.now(), level, code, message:text, count:1});
    if (events.length > 40) events.shift();
  }
  function condition(code, active, message) {
    if (active && !conditions.has(code)) record('warning',code,message);
    if (!active && conditions.has(code)) record('info',code+'-resolved','Condition cleared.');
    if (active) conditions.add(code); else conditions.delete(code);
  }
  function snapshot() {
    const data = read(), torrent = data.torrent;
    condition('buffer-limit',torrent.bytes > torrent.limit,'Video buffer exceeded its configured limit.');
    condition('metadata-limit',data.metadata.bytes > data.metadata.limit,'Metadata cache exceeded its configured limit.');
    condition('retained-buffer',!torrent.active && torrent.bytes > 0,'Video buffer remained after playback stopped.');
    condition('cleanup-failed',Boolean(torrent.lastCleanup && !torrent.lastCleanup.ok),'Playback cleanup did not release the store or readers.');
    condition('cleanup-stalled',Boolean(torrent.stoppingSince && Date.now()-torrent.stoppingSince>30000),'Playback cleanup has been pending for over 30 seconds.');
    condition('torrent-error',Boolean(torrent.active && torrent.error),torrent.error);
    const progress = torrent.receivedBytes !== lastReceived || torrent.servedBytes !== lastServed;
    if (torrent.id !== stalledSession || !torrent.readers || progress) stalledSince = Date.now();
    lastReceived = torrent.receivedBytes; lastServed = torrent.servedBytes; stalledSession = torrent.id;
    condition('download-stalled',Boolean(torrent.active && torrent.readers && Date.now() - stalledSince > 45000),'No download or video-read progress for 45 seconds while a reader is waiting.');
    condition('ui-unresponsive',Boolean(ui && ui.visible && Date.now() - ui.at > 35000),'The TV interface heartbeat is missing; the app may have closed or become unresponsive.');
    condition('video-stalled',Boolean(ui && ui.visible && Date.now() - ui.at < 35000 && ui.video && ui.video.waitingSince && !ui.video.paused && !ui.video.ended && Date.now() - ui.video.waitingSince > 45000),'The TV player has been waiting for video for over 45 seconds.');
    const recentFaults=events.filter(event=>event.level!=='info'&&Date.now()-event.at<60000).slice(-5);
    return {schema:1, boot, version, startedAt, at:Date.now(), status:conditions.size||recentFaults.length?'attention':'observing', conditions:Array.from(conditions), recentFaults, counters, eventLoopLagMs:lagMs, ui, ...data, events:events.slice()};
  }
  let reportsAt = Date.now(), reports = 0;
  function report(input) {
    if(!input||typeof input!=='object')return;
    if (Date.now() - reportsAt > 10000) { reportsAt = Date.now(); reports = 0; }
    if (++reports > 15) return;
    if (input.kind === 'heartbeat') {
      const value = input.video;
      const video = value && typeof value === 'object' ? {
        paused:Boolean(value.paused), ended:Boolean(value.ended),
        currentTime:Math.max(0,Math.min(Number(value.currentTime)||0,1e8)),
        readyState:Math.max(0,Math.min(Number(value.readyState)||0,4)),
        errorCode:Math.max(0,Math.min(Number(value.errorCode)||0,4)),
        waitingSince:ui && ui.video && ui.video.waitingSince || 0
      } : undefined;
      if (video) {
        if (!video.paused && !video.ended && video.readyState < 3) {
          if (!video.waitingSince) video.waitingSince = Date.now();
        } else video.waitingSince = 0;
      }
      ui = {at:Date.now(), visible:Boolean(input.visible), video};
    } else if (['ui-error','ui-rejection','video-error'].includes(input.kind)) {
      record('error',input.kind,input.message || 'The TV interface reported an error.');
    }
  }
  const timer = setInterval(() => {
    const now = Date.now(); lagMs = Math.max(0,now - lastTick - 5000); lastTick = now;
    condition('event-loop-delay',lagMs > 2000,'The service event loop was delayed by over two seconds.');
    snapshot();
  },5000);
  timer.unref();
  record('info','service-start','TV monitor counters started.');
  return {snapshot, report, record, counters, close:() => clearInterval(timer)};
};
