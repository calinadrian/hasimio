// Torrent pieces for playback, kept in a bounded amount of memory instead of on disk. Converted audio already
// writes the video to disk once as segments; storing every downloaded piece as well wrote each movie twice.
// The oldest pieces make room for new ones. WebTorrent is told a dropped piece is missing again, so a later
// read downloads it once more instead of waiting for data that is gone.
const MiB=1024*1024;
// Room for a few pieces even when a torrent uses very large ones.
const MINIMUM_PIECES=8;

// Reads must go through small windows (see inspection-stream.mjs) so the download cannot run far ahead of the
// reader: a selection of the whole file would keep evicting what the reader has not reached yet.
export const PLAYBACK_READ_WINDOW=8*MiB;

export function pieceCacheBytes(env=process.env) {
  const value=env.HASIMIO_PIECE_CACHE_MB;
  if(value===undefined||value==='')return 512*MiB;
  // HASIMIO_PIECE_CACHE_MB: megabytes of memory for torrent pieces, or 0 to keep them on disk as before.
  // A value that is not a number must not stop the engine from starting.
  const size=Number(value);
  return Number.isFinite(size)&&size>=0?Math.floor(size*MiB):512*MiB;
}

// These are WebTorrent internals. A version without them cannot use this store.
export function supportsMemoryStore(torrent) {
  return typeof torrent?._markUnverified==='function'&&typeof torrent._updateSelections==='function'&&typeof torrent._selections?.[Symbol.iterator]==='function';
}
function forget(torrent,index) {
  if(!torrent||torrent.destroyed||!torrent.bitfield?.get(index))return false;
  torrent._markUnverified(index);
  // A reader whose selection already moved past this piece must be offered it again, or its read never finishes.
  for(const selection of torrent._selections)if(selection.from<=index&&index<=selection.to&&selection.from+selection.offset>index)selection.offset=index-selection.from;
  return true;
}

/** Returns a chunk-store class for `client.add(magnet,{store,storeCacheSlots:0})`. `monitor` receives running totals. */
export function createMemoryStore(limit,monitor={}) {
  // `pins` holds the byte ranges ({from,to}, torrent offsets) that readers have open. WebTorrent stops tracking a
  // window once it is downloaded, so a piece dropped before a slow reader reached it would never arrive again.
  // Pinned pieces are never dropped; memory can exceed the limit by the windows that are open.
  Object.assign(monitor,{bytes:0,pieces:0,writtenBytes:0,evictedBytes:0,evictedPieces:0,pins:new Set()});
  return class MemoryStore {
    constructor(chunkLength,options={}) {
      if(!Number.isSafeInteger(chunkLength)||chunkLength<1)throw new Error('Invalid torrent piece length.');
      if(!supportsMemoryStore(options.torrent))throw new Error('This WebTorrent version cannot keep pieces in memory.');
      this.chunkLength=chunkLength;this.torrent=options.torrent;this.limit=Math.max(limit,MINIMUM_PIECES*chunkLength);
      this.entries=new Map();this.bytes=0;this.closed=false;
    }
    put(index,buffer,callback=()=>{}) {
      if(this.closed)return void queueMicrotask(()=>callback(new Error('Playback stopped.')));
      if(buffer.length>this.chunkLength)return void queueMicrotask(()=>callback(new Error('Invalid torrent piece length.')));
      const previous=this.entries.get(index);let dropped=false;
      if(previous){this.bytes-=previous.length;this.entries.delete(index);}
      while(this.bytes+buffer.length>this.limit){
        let victim;for(const entry of this.entries)if(!this.pinned(entry[0])){victim=entry;break;}
        if(!victim)break;
        const [oldest,evicted]=victim;
        this.entries.delete(oldest);this.bytes-=evicted.length;
        monitor.evictedBytes+=evicted.length;monitor.evictedPieces++;
        dropped=forget(this.torrent,oldest)||dropped;
      }
      this.entries.set(index,buffer);this.bytes+=buffer.length;
      monitor.writtenBytes+=buffer.length;monitor.bytes=this.bytes;monitor.pieces=this.entries.size;
      // WebTorrent finishes recording the new piece in the callback; only then may it plan downloads again.
      queueMicrotask(()=>{callback(null);if(dropped&&!this.torrent.destroyed)this.torrent._updateSelections();});
    }
    pinned(index) {const from=index*this.chunkLength,to=from+this.chunkLength-1;for(const pin of monitor.pins)if(pin.from<=to&&from<=pin.to)return true;return false;}
    get(index,options,callback) {
      if(typeof options==='function'){callback=options;options=undefined;}
      const buffer=this.closed?undefined:this.entries.get(index);
      if(!buffer)return void queueMicrotask(()=>callback(new Error('Piece is not buffered.')));
      // Reading marks the piece as recently used, so what is being played is the last to go.
      this.entries.delete(index);this.entries.set(index,buffer);
      const offset=options?.offset||0,length=options?.length==null?buffer.length-offset:options.length;
      if(offset<0||length<0||offset+length>buffer.length)return void queueMicrotask(()=>callback(new Error('Invalid piece range.')));
      queueMicrotask(()=>callback(null,buffer.subarray(offset,offset+length)));
    }
    close(callback=()=>{}) {this.closed=true;this.entries.clear();this.bytes=0;monitor.bytes=0;monitor.pieces=0;queueMicrotask(()=>callback(null));}
    destroy(callback) {this.close(callback);}
  };
}
