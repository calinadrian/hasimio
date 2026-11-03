'use strict';
const NodeFetch = require('node-fetch');
const {AbortController, AbortSignal} = require('abort-controller');
const {URL, URLSearchParams} = require('url');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('core-js/actual/promise/all-settled');
require('core-js/actual/string/match-all');
require('core-js/actual/array/at');

global.URL = URL;
global.URLSearchParams = URLSearchParams;
global.TextDecoder = require('util').TextDecoder;
global.AbortController = AbortController;
global.AbortSignal = AbortSignal;
AbortSignal.timeout = function (milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  timer.unref();
  return controller.signal;
};
AbortSignal.any = function (signals) {
  const controller = new AbortController();
  const abort = function () { signals.forEach(signal => signal.removeEventListener('abort', abort)); controller.abort(); };
  signals.forEach(signal => signal.addEventListener('abort', abort));
  if (signals.some(signal => signal.aborted)) abort();
  return controller.signal;
};
if (!String.prototype.replaceAll) String.prototype.replaceAll = function (search, value) { return this.split(search).join(value); };
if (!Object.fromEntries) Object.fromEntries = entries => { const result = {}; for (const [key, value] of entries) Object.defineProperty(result, key, {value, enumerable:true, writable:true, configurable:true}); return result; };
if (!Object.hasOwn) Object.hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
if (!Array.prototype.flatMap) Array.prototype.flatMap = function (mapper) { return [].concat.apply([], this.map(mapper)); };
if (!Array.prototype.flat) Array.prototype.flat = function () { return [].concat.apply([], this); };

// Node 8 has neither fetch nor web streams. Limit decompressed response sizes,
// redirect counts and socket lifetimes before reusing the desktop providers.
let fetching = 0;
const queue = [];
// Refresh the old runtime's trust roots without disabling TLS validation.
const httpsAgent = new https.Agent({ca:fs.readFileSync(path.join(__dirname,'ca.pem'),'utf8'),keepAlive:true,maxSockets:2});
global.fetch = async function (url, options) {
  if (fetching >= 2) await new Promise((resolve, reject) => { if (queue.length >= 24) reject(new Error('The TV is busy. Retry this source.')); else queue.push(resolve); });
  else fetching++;
  let response;
  try {
    const upstream = await NodeFetch(url, Object.assign({size:8 * 1024 * 1024, timeout:25000, follow:4,agent:target=>target.protocol==='https:'?httpsAgent:undefined}, options));
    const data = await upstream.buffer();
    response = new NodeFetch.Response(data, {url:upstream.url,status:upstream.status,statusText:upstream.statusText,headers:upstream.headers});
  } finally {
    if (queue.length) queue.shift()(); else fetching--;
  }
  if (response.body) response.body.getReader = function () {
    const stream = response.body;
    let total = 0;
    return {
      read: () => new Promise((resolve, reject) => {
        const chunk = stream.read();
        if (chunk !== null) return deliver(chunk);
        if (stream._readableState.endEmitted) return resolve({done:true});
        function clean() { stream.removeListener('readable', readable); stream.removeListener('end', ended); stream.removeListener('error', failed); }
        function deliver(value) { total += value.length; if (total > 16 * 1024 * 1024) { stream.destroy(); reject(new Error('Response exceeds the TV memory budget.')); } else resolve({done:false,value}); }
        function readable() { const value = stream.read(); if (value !== null) { clean(); deliver(value); } }
        function ended() { clean(); resolve({done:true}); }
        function failed(error) { clean(); reject(error); }
        stream.on('readable', readable); stream.once('end', ended); stream.once('error', failed);
      }),
      cancel: () => { stream.destroy(); return Promise.resolve(); }
    };
  };
  return response;
};
