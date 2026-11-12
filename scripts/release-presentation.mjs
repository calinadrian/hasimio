import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function installationNotes(platform){
  if(platform==='android')return 'Requires Android 9+ on ARM64 or 32-bit ARM.\n\nDownload the arm64 APK for 64-bit ARM or the armeabi-v7a APK for 32-bit ARM. Open it on your device and allow installation from that source if prompted.';
  if(platform==='webos')return 'Download the IPK below. Enable Developer Mode on your LG TV and install the package using the webOS CLI.\n\n[Installation steps](https://github.com/calinadrian/hasimio#lg-tv)';
  if(platform==='desktop')return 'Windows: download Hasimio-Setup-<version>.exe below and run the installer.\n\nmacOS (Apple Silicon): if a DMG is attached, download it, open it, and drag Hasimio into Applications.';
  throw Error('Unknown release platform: '+platform);
}
const patterns={desktop:/^v(\d+)\.(\d+)\.(\d+)$/,webos:/^webos-v(\d+)\.(\d+)\.(\d+)$/,android:/^android-v(\d+)\.(\d+)\.(\d+)$/};
export function pruneReleases(platform,{gh=process.env.GH_CLI||'gh',repository='calinadrian/hasimio'}={}){
  const pattern=patterns[platform];if(!pattern)throw Error('Unknown release platform: '+platform);
  const run=args=>{const result=spawnSync(gh,args,{encoding:'utf8',windowsHide:true});if(result.error||result.status!==0)throw Error(result.error?.message||result.stderr||'GitHub command failed');return result.stdout;};
  const releases=JSON.parse(run(['api','repos/'+repository+'/releases?per_page=100','--paginate','--slurp'])).flat().filter(r=>!r.draft&&!r.prerelease&&pattern.test(r.tag_name));
  releases.sort((a,b)=>{const av=pattern.exec(a.tag_name).slice(1).map(Number),bv=pattern.exec(b.tag_name).slice(1).map(Number);return bv[0]-av[0]||bv[1]-av[1]||bv[2]-av[2];});
  for(const release of releases.slice(2)){run(['release','delete',release.tag_name,'--repo',repository,'--yes']);console.log('Removed release '+release.tag_name);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv[2]==='notes')console.log(installationNotes(process.argv[3]));
  else pruneReleases(process.argv[2]);
}
