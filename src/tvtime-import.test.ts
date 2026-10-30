import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {readTVTimeZip,csvRows,parseTVTime,buildTVTimeImport,matchTVTimeShows,zipCrc} from './tvtime-import';

function zip(name:string,text:string,method=8){
  const raw=Buffer.from(text),data=method===8?deflateRawSync(raw):raw,n=Buffer.from(name),header=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(method,8);header.writeUInt32LE(data.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(n.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(data.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(n.length,28);
  header.writeUInt32LE(zipCrc(raw),14);central.writeUInt32LE(zipCrc(raw),16);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(header.length+n.length+data.length,16);
  const result=Buffer.concat([header,n,data,central,n,end]);return result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer;
}
const csv='key,series_name,s_id,season_number,episode_number,runtime,created_at\r\nwatch-episode-abc,"Example, Show",123,0,1,2700,2024-01-02 03:04:05\r\nwatch-episode-def,"Example, Show",123,1,2,2700,2024-01-03 03:04:05\r\nrewatch-episode-def,"Example, Show",123,1,2,2700,2024-02-03 03:04:05\r\nuser-series-abc,Unwatched,456,,,,\r\nwatch-episode-bad,Bad,789,,2,60,\r\n';
describe('TV Time personal-data import',()=>{
  it('reads nested compressed or stored history CSVs without extracting files',async()=>{
    for(const method of [0,8])expect((await readTVTimeZip(zip('nested/tracking-prod-records-v2.csv',csv,method)))['tracking-prod-records-v2.csv']).toBe(csv);
    await expect(readTVTimeZip(zip('access_token.csv','private'))).rejects.toThrow('No TV Time');
    await expect(readTVTimeZip(new ArrayBuffer(10))).rejects.toThrow('not a supported');
    const corrupt=zip('tracking-prod-records-v2.csv',csv);new DataView(corrupt).setUint32(corrupt.byteLength-10,999999999,true);
    await expect(readTVTimeZip(corrupt)).rejects.toThrow('not a supported');
  });
  it('handles quoted fields, escaped quotes, line breaks and BOM',()=>{
    expect(csvRows('\uFEFFname,note\r\n"A, B","a ""quote""\nnext"\r\n')).toEqual([{name:'A, B',note:'a "quote"\nnext'}]);
    expect(()=>csvRows('name\n"unfinished')).toThrow('unfinished');
  });
  it('deduplicates rewatches, keeps specials and never infers episodes from follows or totals',()=>{
    const parsed=parseTVTime({'tracking-prod-records-v2.csv':csv});
    expect(parsed.shows).toHaveLength(1);expect(parsed.skipped).toBe(1);
    expect(parsed.shows[0].episodes).toEqual([{season:0,episode:1,runtime:2700,watchedAt:Date.parse('2024-01-02T03:04:05Z')},{season:1,episode:2,runtime:2700,watchedAt:Date.parse('2024-02-03T03:04:05Z')}]);
  });
  it('combines legacy and v2 watch tables, ignoring movies and counters',()=>{
    const old='type,entity_type,series_id,series_name,season_number,episode_number,watch_date\nwatch,episode,123,Example,1,3,1700000000\nwatch,movie,456,Movie,1,1,1700000000\ncount-watch-episode-series,episode,123,Example,1,9,1700000000';
    const parsed=parseTVTime({'tracking-prod-records-v2.csv':csv,'tracking-prod-records.csv':old});expect(parsed.shows[0].episodes.map(e=>e.episode)).toEqual([1,2,3]);
  });
  it('preserves existing playback and generates interoperable IMDb episode keys',()=>{
    const show=parseTVTime({'tracking-prod-records-v2.csv':csv}).shows[0],existing={position:300,duration:2700,updatedAt:5,completed:false};
    const result=buildTVTimeImport([{show,meta:{id:'tt123',type:'series',name:'Example'}},{show:{...show,tvdb:'999'}}],{'series:tt123:1:2':existing});
    expect(result.preserved).toBe(1);expect(Object.keys(result.history)).toEqual(['series:tt123:0:1']);
    expect(result.history['series:tt123:0:1']).toMatchObject({completed:true,manual:true,duration:2700,titleKey:'series:tt123',videoId:'tt123:0:1'});
    expect(buildTVTimeImport([{show,meta:{id:'tt123',type:'series',name:'Example'}}],result.history).preserved).toBe(1);
  });
  it('matches exact external IDs, reports unresolved shows and supports cancellation',async()=>{
    const show=parseTVTime({'tracking-prod-records-v2.csv':csv}).shows[0],controller=new AbortController(),fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({name:'Example',externals:{thetvdb:123,imdb:'tt123'}}))).mockResolvedValueOnce(new Response('{}',{status:404}));
    const results=await matchTVTimeShows([show,{...show,tvdb:'456'}],controller.signal,()=>{},fetcher);
    expect(results[0].meta?.id).toBe('tt123');expect(results[1].error).toContain('No exact');
    controller.abort();await expect(matchTVTimeShows([show],controller.signal,()=>{},fetcher)).rejects.toThrow();
  });
  it.skipIf(!process.env.TVTIME_EXPORT)('reads the supplied personal export without saving its contents',async()=>{
    const bytes=readFileSync(process.env.TVTIME_EXPORT!),files=await readTVTimeZip(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),parsed=parseTVTime(files);
    console.log(JSON.stringify({shows:parsed.shows.length,episodes:parsed.shows.reduce((sum,show)=>sum+show.episodes.length,0),skipped:parsed.skipped}));
    expect(parsed.shows.length).toBeGreaterThan(0);
  });
});
