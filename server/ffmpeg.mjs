import ffmpegStatic from 'ffmpeg-static';

// Inside the desktop app ffmpeg.exe is unpacked next to app.asar, because Windows cannot run a program from inside the archive.
export const ffmpegPath=ffmpegStatic?.replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
// Torrent files are untrusted: FFmpeg may read them only over the engine's own HTTP route, and only as real video
// containers. Without this a file named .mkv that is really a playlist or script could make FFmpeg open other URLs or local files.
export const inputGuard=['-protocol_whitelist','http,tcp','-format_whitelist','matroska,webm,mov,mp4,avi'];
