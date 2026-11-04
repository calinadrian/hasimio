import {readFile,writeFile} from 'node:fs/promises';

const snapshot=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/verified.json',import.meta.url),'utf8'));
const report=JSON.parse(await readFile(new URL('../.cache/iptv-org-audit/report.json',import.meta.url),'utf8'));
if(Object.keys(report.results).length!==report.englishStreams)throw Error('The channel audit is incomplete.');
if(!snapshot.channels?.length||snapshot.language!=='eng')throw Error('The verified English catalog is missing.');
for(const channel of snapshot.channels)for(const server of channel.servers){
  if(!report.results[server.url]?.ok)throw Error('An unverified stream is present: '+channel.name);
}
await writeFile(new URL('../server/iptv-org-verified.mjs',import.meta.url),'// Generated from the completed IPTV-org stream audit.\nexport default '+JSON.stringify(snapshot,null,2)+';\n');
console.log('Applied '+snapshot.channels.length+' verified English channels, checked '+snapshot.checkedAt);
