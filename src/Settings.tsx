import {playerSettings,savePlayerSettings,preferredQualities,type PreferredQuality,type PlayerSettings} from './preferences';
import {languageName,subtitleLanguages} from './playback-tracks';
import {usePlayerSettings} from './use-player-settings';

export default function Settings(){
  const settings=usePlayerSettings();
  const languages=[...new Set([settings.subtitleLanguage,...subtitleLanguages])].sort((a,b)=>languageName(a).localeCompare(languageName(b)));
  const update=(next:Partial<PlayerSettings>)=>savePlayerSettings({...playerSettings(),...next});
  return <section className="app-settings">
    <div className="section-intro"><h1>Settings</h1></div>
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
  </section>;
}
