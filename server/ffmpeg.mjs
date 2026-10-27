import ffmpegStatic from 'ffmpeg-static';

// Inside the desktop app ffmpeg.exe is unpacked next to app.asar, because Windows cannot run a program from inside the archive.
export const ffmpegPath=ffmpegStatic?.replace(/app\.asar([\\/])/,'app.asar.unpacked$1');
