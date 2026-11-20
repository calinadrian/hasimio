'use strict';

// Parse only complete EBML Tracks elements. A partial header stays unknown.
const headerLimit = 256 * 1024;
const ids = {
  ebml: 0x1a45dfa3, segment: 0x18538067, tracks: 0x1654ae6b, entry: 0xae,
  type: 0x83, codec: 0x86, language: 0x22b59c, bcp47: 0x22b59d,
  name: 0x536e, default: 0x88, enabled: 0xb9,
};

function vint(bytes, offset, limit, isId) {
  const first = bytes[offset];
  if (!first || offset >= limit) return;
  let width = 1, marker = 0x80;
  while (!(first & marker)) { marker >>= 1; width++; }
  if (width > (isId ? 4 : 8) || offset + width > limit) return;
  let value = isId ? first : first & (marker - 1);
  let unknown = !isId && value === marker - 1;
  for (let i = 1; i < width; i++) {
    value = value * 256 + bytes[offset + i];
    unknown = unknown && bytes[offset + i] === 255;
  }
  if (!unknown && !Number.isSafeInteger(value)) return;
  return {value: unknown ? Infinity : value, width};
}

function element(bytes, offset, limit) {
  const id = vint(bytes, offset, limit, true);
  if (!id) return;
  const size = vint(bytes, offset + id.width, limit, false);
  if (!size) return;
  const start = offset + id.width + size.width;
  return {id: id.value, start, end: start + size.value};
}

function entries(bytes, start, end) {
  const audioTracks = [], subtitleTracks = [];
  for (let i = start; i < end;) {
    const item = element(bytes, i, end);
    if (!item || item.end > end) return;
    i = item.end;
    if (item.id !== ids.entry) continue;
    if (audioTracks.length + subtitleTracks.length >= 128) return;
    let type, codec, language, bcp47, title, isDefault = true, enabled = true;
    for (let j = item.start; j < item.end;) {
      const field = element(bytes, j, item.end);
      if (!field || field.end > item.end) return;
      j = field.end;
      const length = field.end - field.start;
      if ([ids.type, ids.enabled, ids.default].includes(field.id)) {
        if (!length || length > 4) return;
        const value = bytes.readUIntBE(field.start, length);
        if (field.id === ids.type) type = value;
        if (field.id === ids.enabled) enabled = !!value;
        if (field.id === ids.default) isDefault = !!value;
      } else if ([ids.codec, ids.language, ids.bcp47, ids.name].includes(field.id)) {
        const value = bytes.toString('utf8', field.start, Math.min(field.end, field.start + 256)).replace(/\x00+$/, '');
        if (field.id === ids.codec) codec = value;
        if (field.id === ids.language) language = value;
        if (field.id === ids.bcp47) bcp47 = value;
        if (field.id === ids.name) title = value;
      }
    }
    if (!enabled || (type !== 2 && type !== 17)) continue;
    if (!codec) return;
    const target = type === 2 ? audioTracks : subtitleTracks;
    const track = {index: target.length, codec, title, default: isDefault, language: bcp47 || language || 'und'};
    if (type === 17) track.supported = /^(?:S_TEXT\/(?:UTF8|WEBVTT)|D_WEBVTT\/(?:SUBTITLES|CAPTIONS))$/.test(codec);
    target.push(track);
  }
  return {audioTracks, subtitleTracks};
}

function matroskaTracks(bytes) {
  const end = Math.min(bytes.length, headerLimit);
  const header = element(bytes, 0, end);
  if (!header || header.id !== ids.ebml || header.end > end) return;
  for (let i = header.end; i < end;) {
    const item = element(bytes, i, end);
    if (!item) return;
    if (item.id === ids.segment) {
      const limit = Math.min(item.end, end);
      for (let j = item.start; j < limit;) {
        const child = element(bytes, j, limit);
        if (!child || child.end > limit) return;
        if (child.id === ids.tracks) return entries(bytes, child.start, child.end);
        j = child.end;
      }
      return;
    }
    i = item.end;
  }
}

module.exports = {headerLimit, matroskaTracks};
