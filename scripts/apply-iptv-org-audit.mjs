import {readFile,rename,unlink,writeFile} from 'node:fs/promises';

const snapshot=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/verified.json',import.meta.url),'utf8'));
const report=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/report.json',import.meta.url),'utf8'));
if(Object.keys(report.results).length!==report.selectedStreams)throw Error('The channel audit is incomplete.');
const languages=Array.isArray(snapshot.languages)?snapshot.languages:[];
if(!snapshot.channels?.length||!['eng','ron'].every(language=>languages.includes(language))||languages.some(language=>!['eng','ron'].includes(language)))throw Error('The verified English and Romanian catalog is missing.');
for(const language of ['eng','ron'])if(!snapshot.channels.some(channel=>channel.language?.split('+').includes(language)))throw Error('No verified channels for language: '+language);
for(const channel of snapshot.channels){
  if(!channel.language||channel.language.split('+').some(language=>!languages.includes(language)))throw Error('A channel without a verified language is present: '+channel.name);
  for(const server of channel.servers){
    const check=report.results[server.url];
    if(!check?.ok||!Number.isFinite(Date.parse(check.checkedAt)))throw Error('Missing playback verification for '+channel.name);
    server.checkedAt=check.checkedAt;
  }
}
const output=new URL('../server/iptv-org-verified.mjs',import.meta.url);
const temporary=new URL(output.href+'.'+process.pid+'.tmp');
try{
  await writeFile(temporary,'// Generated from the completed IPTV-org stream audit.\nexport default '+JSON.stringify(snapshot,null,2)+';\n');
  await rename(temporary,output);
}finally{
  await unlink(temporary).catch(problem=>{if(problem.code!=='ENOENT')throw problem;});
}
console.log('Applied '+snapshot.channels.length+' verified English and Romanian channels, checked '+snapshot.checkedAt);
