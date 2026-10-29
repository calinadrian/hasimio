// Live check against TorrentClaw's public API: one catalog, metadata and stream request.
// Set HASIMIO_TORRENTCLAW_API_KEY to test keyed access. Network access is required.
import assert from 'node:assert/strict';
import {catalogTorrentClaw,metadataTorrentClaw,searchTorrentClaw} from '../server/torrentclaw.mjs';

const series=process.argv[2]??'tt0903747';
console.log(`Key: ${process.env.HASIMIO_TORRENTCLAW_API_KEY?.trim()?'set':'not set (anonymous)'}`);
try{
  const catalog=await catalogTorrentClaw('series','discover',{search:'Breaking Bad'});
  assert.ok(catalog.metas.length,'Catalog search returned no titles');
  console.log(`PASS: catalog search, ${catalog.metas.length} titles, first ${catalog.metas[0].id} ${catalog.metas[0].name}`);
  const {meta}=await metadataTorrentClaw('series',series);
  assert.ok(meta.videos?.length,'Metadata returned no episodes');
  console.log(`PASS: metadata ${meta.id} ${meta.name}, ${meta.videos.length} episodes`);
  const episode=meta.videos.find(video=>video.season>0)??meta.videos[0];
  const {streams}=await searchTorrentClaw('series',`${series}:${episode.season}:${episode.episode}`);
  console.log(`${streams.length?'PASS':'WARN'}: S${episode.season}E${episode.episode}, ${streams.length} streams${streams[0]?`, top ${streams[0].seeders} seeders`:''}`);
}catch(error){
  console.error(`FAIL: ${error.message}`);
  process.exitCode=1;
}
