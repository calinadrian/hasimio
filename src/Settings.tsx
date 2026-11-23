import {playerSettings,savePlayerSettings,preferredQualities,preferredQualityFor,qualityKeys,type PreferredQuality,type PlayerSettings} from './preferences';
import {languageName,subtitleLanguages} from './playback-tracks';
import {usePlayerSettings} from './use-player-settings';
import {currentProfile,requestProfilePicker} from './profile-storage';
import {deviceSync} from './device-sync';
import {EnginePanel,useEngine} from './EngineStatus';
import {version as appVersion} from '../package.json';
import {useState} from 'react';
import {Users} from 'lucide-react';
import {debridProviders,saveDebrid,savedDebrid,validDebridKey} from './debrid';
import {isWebOS} from './webos/platform';

// Debrid, as in Stremio: Torrentio sources come through the service, and files
// it already holds play at once. The key is kept on this device only.
function DebridSettings(){
  const [saved,setSaved]=useState(savedDebrid);
  const [provider,setProvider]=useState(saved?.provider??debridProviders[0].id);
  const [key,setKey]=useState('');
  const [message,setMessage]=useState('');
  const chosen=debridProviders.find(item=>item.id===provider)??debridProviders[0];
  const current=debridProviders.find(item=>item.id===saved?.provider);
  function save(){
    if(!validDebridKey(key)){setMessage('Paste the API key from '+chosen.keyPage+'.');return;}
    const next={provider,key:key.trim()};saveDebrid(next);setSaved(next);setKey('');
    setMessage('Saved. Torrentio sources now come through '+chosen.name+'.');
  }
  function remove(){saveDebrid(undefined);setSaved(undefined);setMessage('Removed. Torrentio sources play as torrents again.');}
  return <div className="settings-card">
    <h2>Debrid</h2>
    <p>{current?<>Connected to <strong>{current.name}</strong> (key ending {saved!.key.slice(-4)}). Sources marked with a plus, such as [RD+], play at once without peers.</>:'Optional. With a debrid account, Torrentio sources come from the service instead of peers, and files it already holds start straight away.'}</p>
    <label className="settings-field">Service<select value={provider} onChange={event=>setProvider(event.target.value)}>{debridProviders.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="settings-field">API key<input type="password" autoComplete="off" spellCheck={false} placeholder={'From '+chosen.keyPage} value={key} onChange={event=>{setKey(event.target.value);setMessage('');}}/></label>
    <div className="settings-actions"><button className="button primary" onClick={save}>Save</button>{saved&&<button className="button secondary" onClick={remove}>Remove</button>}</div>
    {message&&<p className="settings-saved" role="status">{message}</p>}
  </div>;
}

export default function Settings(){
  const settings=usePlayerSettings();
  const engine=useEngine();
  const profile=currentProfile();
  const languages=[...new Set([settings.subtitleLanguage,...(settings.audioLanguage?[settings.audioLanguage]:[]),...subtitleLanguages])].sort((a,b)=>languageName(a).localeCompare(languageName(b)));
  const update=(next:Partial<PlayerSettings>)=>savePlayerSettings({...playerSettings(),...next});
  return <section className="app-settings">
    <div className="section-intro"><h1>Settings</h1></div>
    <div className="settings-card">
      <h2>Profile</h2>
      <div className="settings-profile-row">
        <span className={'profile-avatar profile-color-'+(profile?.color??0)} aria-hidden="true">{profile?.name.slice(0,1).toUpperCase()||'?'}</span>
        <div>
          <strong>{profile?.name||'My profile'}</strong>
          <p>Each profile keeps its own library, watch progress, and preferences.</p>
        </div>
        <button className="button secondary" onClick={()=>{deviceSync.capture();requestProfilePicker();location.reload();}}><Users size={16}/> Switch profile</button>
      </div>
    </div>
    <div className="settings-card">
      <h2>Playback</h2>
      <label className="settings-field">Preferred audio language<select value={settings.audioLanguage} onChange={event=>update({audioLanguage:event.target.value})}><option value="">Source default</option>{languages.map(code=><option key={code} value={code}>{languageName(code)}</option>)}</select></label>
      {(['movie','series','anime'] as const).map(kind=><label key={kind} className="settings-field">{kind==='movie'?'Movie quality':kind==='series'?'Series quality':'Anime quality'}<select value={preferredQualityFor(settings,kind)} onChange={event=>update({[qualityKeys[kind]]:event.target.value as PreferredQuality})}>{preferredQualities.map(quality=><option key={quality} value={quality}>{quality==='Auto'?'Auto (1080p preferred)':quality==='2K'?'2K · 1440p':quality==='4K'?'4K · 2160p':quality}</option>)}</select></label>)}
      <p>Automatic playback picks a source in your audio language first: one whose tracks were checked, or whose release name lists that language. If there is none, it uses another source. After that it prefers instantly available debrid sources, your subtitle language, then the quality you picked for movies, series or anime. If that quality isn’t found, the closest lower one is used. You can choose a different source for each video.</p>
    </div>
    <DebridSettings/>
    <div className="settings-card">
      <h2>Subtitles</h2>
      <label className="settings-field">Preferred subtitle language<select value={settings.subtitleLanguage} onChange={event=>update({subtitleLanguage:event.target.value,autoSubtitles:true})}>{languages.map(code=><option key={code} value={code}>{languageName(code)}</option>)}</select></label>
      <label className="settings-toggle"><input type="checkbox" checked={settings.autoSubtitles} onChange={event=>update({autoSubtitles:event.target.checked})}/>Automatically load my preferred subtitles</label>
      <p>A matching subtitle track is selected when playback starts. If the video has no matching track, Hasimio looks for online subtitles. Romanian and English searches also include subs.ro, YIFY Subtitles and Addic7ed (Romanian also Subtitrari-noi.ro), with no account or API key. If one version fails to load, the next site is tried. Availability and timing depend on the title and video version. You can change the selection in the player.</p>
      <p className="settings-saved">Saved automatically for this profile.</p>
    </div>
    <div className="settings-card">
      <h2>Streaming service</h2>
      <EnginePanel engine={engine}/>
    </div>
    {isWebOS?<p className="settings-saved">Hasimio v{appVersion}</p>:<div className="settings-card">
      <h2>Keyboard shortcuts</h2>
      <dl className="settings-shortcuts">
        <div><dt><kbd>/</kbd></dt><dd>Focus search</dd></div>
        <div><dt><kbd>Space</kbd> / <kbd>K</kbd></dt><dd>Play or pause video</dd></div>
        <div><dt><kbd>←</kbd> / <kbd>→</kbd></dt><dd>Seek 10 seconds in player, or move across shelves &amp; calendar days</dd></div>
        <div><dt><kbd>M</kbd></dt><dd>Mute or unmute player</dd></div>
        <div><dt><kbd>F</kbd></dt><dd>Toggle fullscreen</dd></div>
        <div><dt><kbd>Esc</kbd></dt><dd>Close dialogs or menus</dd></div>
      </dl>
      <p className="settings-saved">Hasimio v{appVersion}</p>
    </div>}
  </section>;
}
