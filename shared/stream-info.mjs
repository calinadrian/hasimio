export const QUALITY_ORDER=['720p','1080p','2K','4K','SD','Other'];
export function detectQuality(value='') {
  if(/\b(?:2160p|4k|3840[ x×]2160)\b/i.test(value))return '4K';
  if(/\b(?:1440p|2k|2560[ x×]1440)\b/i.test(value))return '2K';
  if(/\b(?:1080[pi]|1920[ x×]1080)\b/i.test(value))return '1080p';
  if(/\b(?:720p|1280[ x×]720)\b/i.test(value))return '720p';
  if(/\b(?:480p|576p|360p|dvd|dvdrip)\b/i.test(value))return 'SD';
  return 'Other';
}
export function detectCodec(value='') {
  if(/\b(?:hevc|[xh][ ._-]?265)\b/i.test(value))return 'HEVC';
  if(/\bav1\b/i.test(value))return 'AV1';
  if(/\b(?:avc|[xh][ ._-]?264)\b/i.test(value))return 'H.264';
  return undefined;
}
export function detectRelease(value='') {
  if(/\bremux\b/i.test(value))return 'Blu-ray Remux';
  if(/\b(?:blu[ ._-]?ray|b[rd]rip)\b/i.test(value))return 'Blu-ray';
  if(/\bweb[ ._-]?dl\b/i.test(value))return 'WEB-DL';
  if(/\bweb[ ._-]?rip\b/i.test(value))return 'WEBRip';
  if(/\bhdtv\b/i.test(value))return 'HDTV';
  return undefined;
}
// A size in a source's text, in bytes. The size the source states after the release name ("💾 1.4 GB" on the
// title's later lines) wins over one inside the name ("WEBRip.1400MB"). A number must start with a digit and
// not continue another number ("2,5 GB" stays unknown rather than 5 GB), so ".1400MB" is not read as 0.14 MB. No lookbehind: the TV service runs Node 8.
const SIZE=/(?:^|[^\d.,])\.?(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i,STATED=/💾\s*(\d+(?:\.\d+)?)\s*(TB|GB|MB)\b/i,SIZE_POWER={MB:2,GB:3,TB:4};
export function parseSize(title='',text=''){
  // Torrentio marks the size with 💾; its season-pack titles put a file-name line before that.
  const found=String(title).match(STATED)??String(title).split('\n').slice(1).join('\n').match(SIZE)??String(text).match(SIZE);
  return found?Number(found[1])*1024**SIZE_POWER[found[2].toUpperCase()]:undefined;
}