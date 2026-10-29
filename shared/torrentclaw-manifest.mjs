// Shared by the engine route and the app's built-in source list so they cannot drift.
export const torrentClawManifest={id:'org.hasimio.torrentclaw',name:'TorrentClaw',version:'1.1.0',
  description:'Discover and search movies and shows on TorrentClaw, with episode lists and local torrent playback.',
  resources:['catalog','meta','stream'],types:['movie','series'],idPrefixes:['tt','tmdb:'],
  catalogs:['movie','series'].map(type=>({id:'discover',type,name:`TorrentClaw ${type==='movie'?'movies':'series'}`,extra:[{name:'search'},{name:'skip'}]}))};
