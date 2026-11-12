import {playerSettings,savePlayerSettings,preferredQualities,type PreferredQuality,type PlayerSettings} from './preferences';
import {languageName,subtitleLanguages} from './playback-tracks';
import {usePlayerSettings} from './use-player-settings';
import {currentProfile,requestProfilePicker} from './profile-storage';
import {deviceSync} from './device-sync';
import {EnginePanel,useEngine} from './EngineStatus';
import {version as appVersion} from '../package.json';
import {Users} from 'lucide-react';

export default function Settings(){
  const settings=usePlayerSettings();
  const engine=useEngine();
  const profile=currentProfile();
  const languages=[...new Set([settings.subtitleLanguage,...subtitleLanguages])].sort((a,b)=>languageName(a).localeCompare(languageName(b)));
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
      <label className="settings-field">Preferred quality<select value={settings.preferredQuality} onChange={event=>update({preferredQuality:event.target.value as PreferredQuality})}>{preferredQualities.map(quality=><option key={quality} value={quality}>{quality==='Auto'?'Auto (1080p preferred)':quality==='2K'?'2K · 1440p':quality==='4K'?'4K · 2160p':quality}</option>)}</select></label>
      <p>Used for Play, the source picker, and the next episode. If unavailable, the closest lower quality is used, followed by the closest higher quality. You can choose a different source for each video.</p>
    </div>
    <div className="settings-card">
      <h2>Subtitles</h2>
      <label className="settings-field">Preferred subtitle language<select value={settings.subtitleLanguage} onChange={event=>update({subtitleLanguage:event.target.value,autoSubtitles:true})}>{languages.map(code=><option key={code} value={code}>{languageName(code)}</option>)}</select></label>
      <label className="settings-toggle"><input type="checkbox" checked={settings.autoSubtitles} onChange={event=>update({autoSubtitles:event.target.checked})}/>Automatically load my preferred subtitles</label>
      <p>A matching subtitle track is selected when playback starts. If the video has no matching track, Hasimio looks for online subtitles. Romanian searches also include Subtitrari-noi.ro, with no account or API key. Availability and timing depend on the title and video version. You can change the selection in the player.</p>
      <p className="settings-saved">Saved automatically for this profile.</p>
    </div>
    <div className="settings-card">
      <h2>Streaming service</h2>
      <EnginePanel engine={engine}/>
    </div>
    <div className="settings-card">
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
    </div>
  </section>;
}
