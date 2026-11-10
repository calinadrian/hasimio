import {readFile,writeFile} from 'node:fs/promises';

const snapshot=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/verified.json',import.meta.url),'utf8'));
const report=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/report.json',import.meta.url),'utf8'));
if(Object.keys(report.results).length!==report.selectedStreams)throw Error('The channel audit is incomplete.');
const languages=Array.isArray(snapshot.languages)?snapshot.languages:[];
if(!snapshot.channels?.length||!languages.length||languages.some(language=>!['eng','ron'].includes(language)))throw Error('The verified English and Romanian catalog is missing.');
for(const channel of snapshot.channels){
  if(!channel.language||channel.language.split('+').some(language=>!languages.includes(language)))throw Error('A channel without a verified language is present: '+channel.name);
  for(const server of channel.servers){
    if(!report.results[server.url]?.ok)throw Error('An unverified stream is present: '+channel.name);
  }
}
await writeFile(new URL('../server/iptv-org-verified.mjs',import.meta.url),'// Generated from the completed IPTV-org stream audit.\nexport default '+JSON.stringify(snapshot,null,2)+';\n');
console.log('Applied '+snapshot.channels.length+' verified English and Romanian channels, checked '+snapshot.checkedAt);
