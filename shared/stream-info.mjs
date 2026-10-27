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
