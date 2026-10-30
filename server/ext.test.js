import {describe,it,expect,vi} from 'vitest';
import {extRows,extStream,searchExt} from './ext.mjs';
const hash='a'.repeat(40),name='Example.Show.S01E02.1080p.WEB.H264';
const row=(title=name,path='/example-show-123/')=>`<tr><td><div><a class="torrent-title-link" href="${path}">${title}</a></div></td><td><div><span>Size</span><span>1.5 GB</span></div></td><td>Uploader</td><td>Today</td><td><div><span>Seeders</span><span>123</span></div></td><td>2</td></tr>`;
const page=rows=>`<title>EXT Torrents</title><table class="table search-table"><tbody>${rows}</tbody></table>`;
describe('EXT source',()=>{
  it('parses size and seeders and confines detail links to EXT',()=>{
    const rows=extRows(page(row()+row(name,'https://other.test/example-123/')+row(name,'//other.test/example-123/')));
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name,id:'123',sizeBytes:1.5*1024**3,seeders:123});
  });
  it('validates magnet hashes and contradictory IMDb metadata',()=>{
    const item=extRows(page(row()))[0];
    expect(extStream(`magnet:?xt=urn:btih:${hash}`,item,'tt123')).toMatchObject({provider:'EXT',infoHash:hash,quality:'1080p'});
    expect(extStream(`magnet:?xt=urn:btih:${hash}`,item,'tt123','imdb.com/title/tt999')).toBeUndefined();
    expect(extStream('magnet:?xt=urn:btih:invalid',item,'tt123')).toBeUndefined();
  });
  it('filters wrong titles, episodes and executable releases before fetching details',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(page(row()+row('Other.Show.S01E02.1080p','/other-124/')+row('Example.Show.S01E03.1080p','/example-125/')+row(name+'.exe','/example-126/')))).mockResolvedValueOnce(new Response(`magnet:?xt=urn:btih:${hash}&amp;dn=Example`));
    const result=await searchExt('series','tt123:1:2',fetcher,async()=>({name:'Example Show'}));
    expect(result.streams).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][0]).toContain('/browse/');
  });
  it('retrieves token-based magnets from detail pages',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(page(row()))).mockResolvedValueOnce(new Response(`<meta name="csrf-token" content="csrf"><script>window.pageToken = 'token';</script>`)).mockResolvedValueOnce(new Response(JSON.stringify({url:`magnet:?xt=urn:btih:${hash}`})));
    expect((await searchExt('series','tt123:1:2',fetcher,async()=>({name:'Example Show'}))).streams).toHaveLength(1);
    const [url,options]=fetcher.mock.calls[2];expect(url).toBe('https://ext.to/ajax/getTorrentMagnet.php');expect(options.method).toBe('POST');expect(options.body.get('hmac')).toMatch(/^[a-f0-9]{64}$/);expect(options.body.get('sessid')).toBe('csrf');
  });
  it('reports browser verification and missing magnet access clearly',async()=>{
    await expect(searchExt('series','tt123:1:2',async()=>new Response('blocked',{status:403}),async()=>({name:'Example Show'}))).rejects.toThrow('browser verification');
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(page(row()))).mockResolvedValueOnce(new Response('no tokens'));
    await expect(searchExt('series','tt123:1:2',fetcher,async()=>({name:'Example Show'}))).rejects.toThrow('magnet details');
  });
});
