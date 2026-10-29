export const stremioSources={
  torrentio:{name:'Torrentio',manifestUrl:'https://torrentio.strem.fun/manifest.json',enabled:true},
  comet:{name:'Comet',manifestUrl:'https://comet.elfhosted.com/manifest.json',enabled:false},
};
export const stremioManifests=Object.fromEntries(Object.entries(stremioSources).map(([key,{name}])=>[key,{
  id:`org.hasimio.${key}`,name,version:'1.0.0',
  description:key==='comet'?'Movie, series and anime sources from Comet. Requires a configured instance; see README for setup.':'Movie, series and anime torrent sources from Torrentio, played through Hasimio’s local torrent service.',
  resources:['stream'],types:['movie','series','anime'],idPrefixes:['tt','kitsu:'],catalogs:[],
}]));
