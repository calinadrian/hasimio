import fs from 'node:fs';

// FileList was removed in 0.1.69, leaving no way to clear a saved passkey from the app.
// Runs at every start, so a locked file is retried next time.
export function removeFileListLogin(filename) {
  for(const file of [filename,filename+'.tmp']){
    try {fs.rmSync(file,{force:true});} catch {/* Retried on the next start. */}
  }
}
