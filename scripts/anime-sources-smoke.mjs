// Anime sources must not wait for Kitsu's whole series. A stand-in Kitsu answers the opened season quickly
// but walks the sequels slowly; sources for that season's first episode must appear in the meantime. When
// Kitsu is down, the title page says the episode list failed and Try again recovers. A later season opened
// from a shelf keeps its episode once Play is pressed, even after the first season is merged in.
// Runs in a throwaway profile under .cache, never the installed app's.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer as httpServer} from 'node:http';
import path from 'node:path';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const require=createRequire(import.meta.url),folder=path.resolve('.cache/anime-sources-smoke');
await rm(folder,{recursive:true,force:true});
await mkdir(folder,{recursive:true});
const streamIds=[];
const service=httpServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Content-Type','application/json');
  if(req.url==='/stats')return res.end(JSON.stringify({streamIds}));
  const match=/^\/stream\/[a-z]+\/([^/]+)\.json$/.exec(req.url);
  if(match){streamIds.push(decodeURIComponent(match[1]));return res.end(JSON.stringify({streams:[{name:'Fixture 1080p',url:'https://example.com/test.mp4'}]}));}
  res.end('{}');
});
service.listen(0,'127.0.0.1');await once(service,'listening');
const fixture=`http://127.0.0.1:${service.address().port}`;
const addons=[
  {url:'https://kitsu.io/api/edge',enabled:true,manifest:{id:'org.hasimio.kitsu',name:'Hasimio Anime',version:'1.0.0',types:['anime','movie','series'],idPrefixes:['kitsu:'],resources:['catalog','meta'],catalogs:[]}},
  {url:fixture+'/manifest.json',enabled:true,manifest:{id:'anime-fixture',name:'Anime fixture',version:'1',resources:['stream'],types:['series','anime'],idPrefixes:['kitsu:'],catalogs:[]}},
];
const library=[
  {id:'kitsu:100',type:'series',name:'Fixture Anime',category:'anime',sourceUrl:'https://kitsu.io/api/edge'},
  {id:'kitsu:200',type:'series',name:'Second Fixture',category:'anime',sourceUrl:'https://kitsu.io/api/edge'},
];
const flags=['remove-filelist-v1','piratebay-v1','yts-v1','eztv-v1','torrentdownloads-v1','torrentclaw-v1','titles-v1','torrentio-v1','comet-v1','ext-v1'].map(flag=>'hasimio:'+flag);
const vite=await createServer({configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/.cache/**']}}});
await vite.listen();
async function run({url,fixture,addons,library,flags,profile}){
  const {app,BrowserWindow,session}=require('electron'),assert=require('node:assert/strict');
  app.setPath('userData',profile);
  await app.whenReady();
  // Stand-in Kitsu. While slow, the opened season answers in 600 ms and each sequel step takes 2.5 s.
  // Titles in failing get HTTP 503 (Second Fixture from the start, so the Library's own refresh cannot load it either).
  let slow=true;const failing=new Set(['200']),kitsuRoutes=[];
  const record=(id,canonicalTitle,startDate)=>({id,type:'anime',attributes:{canonicalTitle,subtype:'TV',startDate,titles:{en:canonicalTitle},episodeLength:24}});
  const shows={100:record('100','Fixture Anime','2023-01-01'),101:record('101','Fixture Anime Season 2','2024-01-01'),200:record('200','Second Fixture','2022-01-01'),
    300:record('300','Third Fixture','2021-01-01'),301:record('301','Third Fixture Season 2','2022-01-01')};
  const episodeCount={100:3,101:2,200:2,300:2,301:2},relations={100:[['sequel','101']],101:[['prequel','100']],200:[],300:[['sequel','301']],301:[['prequel','300']]};
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  session.defaultSession.protocol.handle('https',async request=>{
    const target=new URL(request.url);
    const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/vnd.api+json','Access-Control-Allow-Origin':'*'}});
    // Nothing else leaves this machine during the test.
    if(target.hostname!=='kitsu.io')return new Response('',{status:404});
    const route=target.pathname.replace('/api/edge/','');kitsuRoutes.push(route);
    // Trending lists only the second season of Third Fixture, as Kitsu's airing shelves often do.
    if(route==='trending/anime')return reply({data:[shows[301]]});
    const [,id,part]=/^anime\/(\d+)(?:\/([a-z-]+))?$/.exec(route)??[];
    if(failing.has(id))return reply({errors:[{status:'503'}]},503);
    if(!shows[id])return reply({data:[]});
    if(part==='episodes'){
      if(slow)await delay(600);
      const data=Array.from({length:episodeCount[id]},(_,index)=>({id:id+index,type:'episodes',attributes:{number:index+1,relativeNumber:index+1,seasonNumber:1,canonicalTitle:'Episode '+(index+1),airdate:'2023-01-0'+(index+1)}}));
      return reply({data,meta:{count:data.length},links:{}});
    }
    if(part==='media-relationships'){
      if(slow)await delay(2500);
      return reply({data:relations[id].map(([role,to])=>({type:'mediaRelationships',attributes:{role},relationships:{destination:{data:{type:'anime',id:to}}}})),included:relations[id].map(([,to])=>shows[to])});
    }
    return reply({data:shows[id]});
  });
  const win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});
  const js=s=>win.webContents.executeJavaScript(s,true);
  const wait=async(s,ms=6000)=>{for(const end=Date.now()+ms;Date.now()<end;){if(await js(s))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+s);};
  const click=async s=>{await js(`(${s}).click()`);await new Promise(r=>setTimeout(r,50));};
  const card=name=>`[...document.querySelectorAll(".poster-card")].find(card=>card.textContent.includes(${JSON.stringify(name)}))`;
  const play='document.querySelector(".detail-actions .primary")';
  const picker='document.querySelector(".stream-picker")';
  const stats=async()=>(await fetch(fixture+'/stats')).json();
  try{
    await win.loadURL(new URL('/favicon.png',url).href);
    await js(`localStorage.clear();localStorage.setItem('hasimio:library',${JSON.stringify(JSON.stringify(library))});localStorage.setItem('hasimio:addons',${JSON.stringify(JSON.stringify(addons))});${JSON.stringify(flags)}.forEach(flag=>localStorage.setItem(flag,'done'));`);
    await win.loadURL(url);
    await wait('!!document.querySelector(\'.nav-item[aria-label="Library"]\')');
    await click('document.querySelector(\'.nav-item[aria-label="Library"]\')');
    await wait(`!!${card('Fixture Anime')}`);
    const start=Date.now();
    await click(card('Fixture Anime'));
    // Before any episode is known: the page says it is loading episodes, not that there are no sources.
    await wait(`${play}?.textContent.includes("Loading episodes")`,1000);
    assert.match(await js(`${picker}.textContent`),/Loading episodes/);
    assert.doesNotMatch(await js(`${picker}.textContent`),/No sources available yet/);
    await wait(`!!document.querySelector(".detail-actions .primary:not(:disabled)")`,2400);
    const ready=Date.now()-start;
    assert.match(await js(`${play}.textContent`),/E1/);
    assert.ok(await js('[...document.querySelectorAll(".loading")].some(e=>e.textContent.includes("Loading details"))'),'Sources must appear while the other seasons are still loading');
    assert.deepEqual((await stats()).streamIds,['kitsu:100:1']);
    console.log(`PASS: sources for the opened season's first episode in ${ready}ms, while the sequel walk (2500ms) was still running.`);
    await wait('document.querySelectorAll(".season-tabs button").length===2',6000);
    await wait('![...document.querySelectorAll(".loading")].some(e=>e.textContent.includes("Loading details"))');
    assert.match(await js(`${play}.textContent`),/E1/,'The merged series keeps the first episode');
    assert.deepEqual((await stats()).streamIds,['kitsu:100:1'],'Merging the seasons must not repeat the source search');
    console.log(`PASS: both seasons merged after ${Date.now()-start}ms without moving the episode or repeating the search.`);

    await click('document.querySelector(".close-dialog")');
    await click(card('Second Fixture'));
    await wait(`${picker}?.textContent.includes("The episode list could not be loaded")`,6000);
    assert.match(await js(`${play}.textContent`),/Episodes unavailable/);
    assert.doesNotMatch(await js(`${picker}.textContent`),/No sources available yet/);
    console.log('PASS: with Kitsu down, the page says the episode list failed instead of "No sources available yet".');
    failing.clear();slow=false;
    await click(`[...${picker}.querySelectorAll("button")].find(button=>button.textContent.includes("Try again"))`);
    await wait(`!!document.querySelector(".detail-actions .primary:not(:disabled)")`,4000);
    assert.ok((await stats()).streamIds.includes('kitsu:200:1'));
    console.log('PASS: Try again reloads the episode list and finds sources.');

    // A later season opened from a shelf: its own episode is a provisional pick, and the merged series would
    // choose S1 E1. Once Play is pressed, the episode must not change when the other season arrives.
    await click('document.querySelector(".close-dialog")');
    slow=true;
    await click('document.querySelector(\'.nav-item[aria-label="Discover"]\')');
    await wait(`!!${card('Third Fixture')}`);
    await click(card('Third Fixture'));
    await wait(`!!document.querySelector(".detail-actions .primary:not(:disabled)")`,2400);
    assert.equal((await stats()).streamIds.at(-1),'kitsu:301:1');
    const pressed=kitsuRoutes.length;
    await click(play);
    for(const end=Date.now()+9000;Date.now()<end&&!kitsuRoutes.slice(pressed).includes('anime/300/episodes');)await new Promise(r=>setTimeout(r,100));
    assert.ok(kitsuRoutes.slice(pressed).includes('anime/300/episodes'),'The first season must still be merged in');
    await new Promise(r=>setTimeout(r,1000));
    assert.ok(!(await stats()).streamIds.includes('kitsu:300:1'),'Pressing Play keeps the episode: the merged series must not switch to S1 E1');
    console.log('PASS: after Play on a later season, merging the first season neither switches the episode nor searches again.');
    app.exit(0);
  }catch(error){console.error(error);console.error(await js('document.querySelector(".detail-dialog")?.textContent').catch(()=>''));console.error(await stats().catch(()=>''),kitsuRoutes);app.exit(1);}
}
const runner=path.join(folder,'electron.cjs');
await writeFile(runner,`(${run.toString()})(${JSON.stringify({url:vite.resolvedUrls.local[0],fixture,addons,library,flags,profile:path.join(folder,'profile')})})`);
try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[runner],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
  const watchdog=setTimeout(()=>child.kill(),40000);
  const [code]=await once(child,'exit');clearTimeout(watchdog);
  assert.equal(code,0,'Anime sources smoke test failed');
}finally{await vite.close();service.closeAllConnections();await new Promise(resolve=>service.close(resolve));}
