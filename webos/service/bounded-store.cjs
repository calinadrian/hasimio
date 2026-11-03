'use strict';

// No filesystem backing and no whole-file allocation. WebTorrent's availability
// bitfield must be cleared on eviction, otherwise seeks would read missing data
// forever instead of requesting it from peers again.
module.exports = function createBoundedStore(limit, onEvict, onCreate) {
  return class BoundedStore {
    constructor(chunkLength) {
      if (!Number.isSafeInteger(chunkLength) || chunkLength < 1 || chunkLength > 4 * 1024 * 1024) {
        throw new Error('This torrent uses oversized pieces. Choose another source.');
      }
      this.chunkLength = chunkLength;
      this.limit = limit;
      this.bytes = 0;
      this.entries = new Map();
      this.closed = false;
      this.monitor = {writtenBytes:0, evictedBytes:0, evictedPieces:0, hits:0, misses:0, clearedBytes:0};
      onCreate(this);
    }

    put(index, buffer, callback) {
      if (this.closed) return process.nextTick(() => { if (callback) callback(new Error('Playback stopped.')); });
      if (buffer.length > this.chunkLength) throw new Error('Invalid torrent piece length.');
      const previous = this.entries.get(index);
      if (previous) { this.bytes -= previous.length; this.entries.delete(index); }
      while (this.bytes + buffer.length > this.limit && this.entries.size) {
        const oldest = this.entries.keys().next().value;
        const evicted = this.entries.get(oldest).length;
        this.bytes -= evicted;
        this.monitor.evictedBytes += evicted;
        this.monitor.evictedPieces++;
        this.entries.delete(oldest);
        onEvict(oldest);
      }
      this.entries.set(index, buffer);
      this.bytes += buffer.length;
      this.monitor.writtenBytes += buffer.length;
      if (callback) process.nextTick(callback);
    }

    get(index, options, callback) {
      if (typeof options === 'function') { callback = options; options = {}; }
      options = options || {};
      const buffer = this.entries.get(index);
      if (this.closed || !buffer) { this.monitor.misses++; return process.nextTick(() => callback(new Error('Piece is not buffered.'))); }
      this.monitor.hits++;
      this.entries.delete(index);
      this.entries.set(index, buffer);
      const offset = options.offset || 0;
      const length = options.length == null ? buffer.length - offset : options.length;
      process.nextTick(() => callback(null, buffer.slice(offset, offset + length)));
    }

    close(callback) {
      this.closed = true;
      this.monitor.clearedBytes += this.bytes;
      this.entries.clear();
      this.bytes = 0;
      if (callback) process.nextTick(callback);
    }

    destroy(callback) { this.close(callback); }
  };
};
