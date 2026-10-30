---
name: Hasimio
description: Neutral grey and black media browsing with quality-first playback.
colors:
  accent: "#e0e0e0"
  background: "#141414"
  sidebar: "#1c1c1c"
  header: "#181818"
  panel: "#242424"
  source: "#2b2b2b"
  source-hover: "#343434"
  primary: "#424242"
  primary-end: "#424242"
  primary-text: "#f9f9f9"
  text: "#ededed"
  muted: "#bcbcbc"
  line: "#3e3e3e"
  active-navigation: "#383838"
  active-navigation-text: "#f2f2f2"
  field: "#2e2e2e"
  field-border: "#5e5e5e"
  tag: "#474747"
  tag-text: "#d1d1d1"
  seeders: "#cdcdcd"
  codec-note: "#dddddd"
  codec-note-background: "#434343"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "74px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "12px"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "36px"
    fontWeight: 650
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "24px"
    fontWeight: 700
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  source:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
rounded:
  tag: "3px"
  field: "4px"
  control: "12px"
  poster: "7px"
  dialog: "9px"
spacing:
  compact: "8px"
  small: "12px"
  regular: "16px"
  source: "20px"
  section: "32px"
  desktop-gutter: "42px"
components:
  button-primary:
    textColor: "{colors.primary-text}"
    rounded: "{rounded.control}"
    padding: "11px 19px"
    height: "46px"
  source-row:
    backgroundColor: "{colors.source}"
    rounded: "{rounded.control}"
    padding: "20px"
  source-row-hover:
    backgroundColor: "{colors.source-hover}"
  quality-select:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    height: "48px"
---

# Design System: Hasimio

## Overview

The user requested a neutral grey/black design across the entire app. The system uses charcoal navigation, grey content surfaces, white emphasis and readable typography. The player stage and letterbox areas are pure black, with black top and bottom control gradients. Video and poster artwork retain their original colors. Artwork leads discovery; playback controls lead the stream selector. This replaces the earlier blue theme while retaining library, calendar and extension behavior.

## Colors

White marks selection, saved state and keyboard focus. Near-black charcoal separates navigation from grey panels. Source rows use a slightly lighter grey surface; hover increases separation without a floating shadow. Muted text stays readable against those surfaces. Seeders use a light grey status treatment; HEVC uses a grey codec chip, identifying compatibility information rather than promising playback success.

Primary buttons use the light accent fill (#e0e0e0) with near-black text, so each screen has one clear main action; secondary buttons use opaque grey fills without perimeter borders. Source-row Play buttons are secondary so the title's main Play stays the only light button. Shared control colors and 12px corner radii are defined in src/controls.css, loaded after surface styles from main.tsx. Shell layout, spotlight and title details remain in src/shell.css. Keep interface colors neutral; do not reintroduce blue or cyan into app chrome.

## Typography

Use Manrope for headings and DM Sans for controls and body text. Body and poster titles remain 16px; common supporting text is 13–15px. Shelf headings are 24px, page headings 32–36px, and source-provider names 17px. The spotlight has its separate large, widely tracked title. Keep useful information readable at ordinary browser zoom.

## Layout

Desktop uses a 240px fixed rail and a 76px header that holds only search. The rail narrows to 216px below 1150px; at 760px and below it becomes a 64px bottom tab bar with short labels, and the header shows the brand mark beside a full-width search. Pages use plain titles (Library, Progress, Calendar, Extensions, Sync devices) without taglines; Discover goes straight from the spotlight to its filters. The sidebar footer shows sync status and links to Sync devices. Shelf arrows appear on hover or focus for pointer devices and are hidden on touch screens. Media shelves show five posters by default, six at 1600px, four below 1150px, and two on mobile. Swipe, trackpad, keyboard focus and arrow navigation remain available; native horizontal scrollbars are hidden. Poster titles can wrap to two lines without reserving empty height; year/type metadata follows with a 5px margin.

The quality-first selector sits inside title details. Its order is heading and explanation, Quality and Sort by dropdowns, selected-tier count, then source rows. Desktop dropdowns are side by side; mobile stacks them. Source rows use icon, information and Play columns; Play moves below information on mobile. The close button stays visible as the dialog scrolls.

The calendar begins with a compact three-title Coming up strip, followed by month navigation and a seven-column month grid. On desktop, a poster-led agenda sits beside the grid; narrower screens place it below. Month-grid release tiles pair a small poster thumbnail with the title and episode label; missing artwork falls back to a film icon. Selected days use a light inset outline, today uses a white date circle, and mobile release days use up to three white dots. The full tracked-title list stays in a native disclosure below the month, including titles without announced dates. Agenda entries open the specific episode. Day cells support arrow-key navigation across month boundaries. Extensions continue to use divider-separated rows and a stacking installation form.

## Elevation & Depth

Most hierarchy comes from surface color and thin dividers. Photography uses dark directional shading. Dialogs retain their dark backdrop and existing soft shadow; source rows use no individual shadows. Hover and focus remain distinct. Reduced-motion preference disables animation and smooth scrolling.

## Shapes

Controls and source rows use compact 4–5px corners. Posters use 7px corners; dialogs use 9px corners. Small codec and release-format chips use 3px corners. Avatars and today/saved markers remain circular.

## Components

### Live TV

Live TV reuses the shell's neutral grey fields, buttons, dividers, typography and compact control corners around a pure black video stage. The sidebar entry reads Live TV on desktop and Live in the mobile tab bar; Extensions shortens to Add-ons on mobile. A labeled Channel select switches between Cartoon Network, A1 and TLC. A channel icon, selected channel title and provider line sit beside the labeled Server select on desktop. Server counts reflect each channel. At 760px and below the select moves to its own row and the stage uses a 420px height; desktop uses a 16:9 stage with a 320px minimum height and a 1440px page maximum.

The idle stage centers a channel icon, title, short direct-stream explanation and the light primary Watch channel action. The active stage contains only the channel video with native video controls for playback, volume and fullscreen; the video retains its proportions against black letterboxing. Loading, slow-loading and opening-failure messages direct users to switch servers or retry. The toolbar keeps Reload and Stop reachable, stacking below 1100px. Supporting copy identifies Cool-eTv and explains that the two server pages currently reference the same stream. Keep provider websites and their controls outside this surface.

### Quality-first playback

Only qualities supplied by sources appear. Known tiers are 720p, 1080p, 2K/1440p, 4K/2160p and SD. Unspecified quality stays explicit. Default to 1080p when available, then 720p. Selecting a quality filters the source list; it does not start playback. Sorting uses seeders or actual file size, with unknown sizes last.

Each row shows provider, release format and codec where known, then size and seeders. Long release filenames and original extension details remain under the native Release details disclosure. Play performs the existing playback action. Empty, loading, partial-failure and unsupported-source states remain explicit.

### Controls and accessibility

Use native labeled selects with consistent grey field treatment and 48px minimum height. Default action buttons remain 46px high; source Play actions are at least 44px. Focus uses a 2px white outline with a 4px offset. Icon-only controls retain accessible names.

### Browsing and feedback

Poster shelves retain saved marks, keyboard focus and hover overlays. Toasts, buffering and extension settings inherit the grey surfaces. The torrent buffering screen keeps cancellation visible, supports file selection and shows actionable failure recovery. Its status strip shows actual peer and transfer data.

Removing a library title or an extension shows a toast with Undo; the toast pauses while hovered or focused and renders inside the details dialog when it is open.

### Resume and one-click play

Discover and Library open with a Continue watching shelf built from playback history, newest first; finished movies and series whose last episode is finished drop out. Only titles already known from the library or loaded catalogs can appear. A featured spotlight title is left out of the shelves below it. On phones the spotlight puts the artwork above the text, with both actions on one row. The spotlight shows the most recent unfinished title with a backdrop, labelled Continue watching with its episode and a thin white progress line, and offers Resume. Otherwise it shows the first live catalog title with a backdrop and description, labelled Featured pick; the offline starter pick appears only when no catalog loaded. Spotlight data comes from the title itself, the description is clamped to two lines, and titles longer than six characters use a compact untracked heading.

Title details use a 1040px dialog: backdrop art, then a poster beside the title, facts and actions. A sticky top bar keeps Close available and shows the title once the artwork scrolls away. Title details place a primary Play (or Resume S2 · E3) button beside Save. It plays the most-seeded source of the default quality, skipping unseeded torrents when another source exists, and shows Finding sources… while loading. The full quality-first selector stays below, collapsed to a "N sources in M qualities" row until opened. The provider name appears once in the summary when all sources share it.

Series list episodes by season: season chips for up to six seasons, otherwise a Season select showing episode counts (Specials last), above a divider-free list that shows ten episodes and expands with Show all, so the dialog keeps a single scroll area. Each row shows the episode number, title, air date or Date unannounced, an Upcoming chip, and a watched toggle or progress bar. The selected episode uses a quiet grey surface, a fine neutral perimeter outline and a softly filled number tile. No side accent bar is used. Watched indicators are compact circles within 44px hit targets, and keyboard focus remains distinct. The selected row is scrolled into view.

Watched tracking is manual and available at a glance: each episode row has a round check toggle for watched/unwatched. Mark all as watched above the episode list checks every season and offers Undo. Checking an episode offers to catch up every earlier unwatched episode, and when episodes before the selected one are still unwatched a compact bar above the list keeps Mark previous watched available. Movies offer the same Watched toggle beside Save. Manual marks use known file or provider runtime for time watched, undo restores the exact earlier bookmarks, and checked episodes sync with playback progress across devices.

### Progress

The Progress tab uses six rounded neutral summary cards, in six columns on wide screens, three below 1250px and two on mobile. It shows watched episodes and movies, series started and finished, remaining episodes and time watched in minutes, hours and days. Progress follows Apple-inspired background grouping: charcoal summary cards and softly raised rounded sections for series, movies and expandable activity, with inset controls and a grey segmented filter. Use spacing instead of decorative divider lines between summary statistics, rows and sections. The series list uses two columns when the Progress content is at least 1000px wide, keeping completion status close to each title; narrower content uses one column. Rows use compact poster thumbnails, separate TV Series/Anime category tabs, All/Watching/Finished filters scoped to the selected category, and a native sort select. Completion bars remain visible. A scoped title search filters both series and watched movies without changing lifetime totals. Show eight series and six movies per page with independent previous/next controls and explicit result ranges; reset pages after searching, filtering or sorting, and clamp pages when tracked data changes. Recent activity is collapsed under an expandable section below the lists; bulk manual marks appear as one activity entry. Unknown episode totals have an explicit label and no percentage or empty progress bar. Missing episode metadata loads with bounded concurrency, with Refresh totals available. Time watched includes manual marks using episode or movie runtime, falls back to a series’ usual episode length, and reports missing runtimes explicitly. Movies use compact rows below series. Preserve the shell's neutral colors, focus styles and existing typefaces.

## Do's and Don'ts

- Do retain the readable type scale and compact title/year grouping.
- Do expose only available qualities and preserve unspecified values honestly.
- Do keep original release information accessible without crowding the initial source scan.
- Do preserve source, calendar and library behavior when changing appearance.
- Don't suggest that seeder counts or codec badges guarantee playback.
- Don't replace the chosen grey/black system with unrelated color themes.

### Audio and dub selection

The torrent player places a labeled native Audio / dub select above the video, using the existing grey fields, 48px control height and white keyboard focus. Options come from embedded tracks, with language, title and codec when present; untagged tracks use numbered labels. Show language-discovery progress and a retry action on failure. State that audio changes restart playback and explain when a file contains only one track. The controls stack on mobile.

The player pairs Audio / dub and Subtitles selects in two equal columns, stacking on narrow screens. A local SRT / VTT chooser sits with subtitle controls; preparation and failures stay visible without blocking video. Source rows show concise audio/subtitle information below transfer facts. Visible torrent sources automatically inspect file headers. Rows show queued/checking progress, confirmed counts with “Checked in file,” or a specific failure with Retry track check. Audio and subtitle language names appear directly on separate labeled lines, with track counts; full codec/title details remain under Release details. Duplicate languages are grouped, while untagged tracks say Unspecified. Compatible audio is the default on every device; original audio remains an explicit option.

## Unified cinema player

Player.tsx and player.css replace the native control strip and detached settings bar with one black video stage. The title/back control sits at the top, transfer status stays compact on desktop, and bottom controls combine a buffered seek bar, transport/volume/time, audio, subtitles, download, settings, picture-in-picture and fullscreen. White marks the active track/menu and playback progress. Controls fade during playback, returning on pointer or keyboard input; keyboard focus and open menus keep them visible.

Menus are solid dark grey panels anchored above the toolbar, with readable native fields, an explicit close action, visible keyboard focus and internal scrolling. The subtitle panel includes file loading, size and timing. Downloads explain original-file contents and session lifetime. Mobile uses two control rows with 44px targets and a full-width menu, retaining a separate landscape layout. The playback dialog expands around the stage and hides its redundant outer close button; Back to sources remains inside the player. Fullscreen keeps all menus inside the fullscreen element.


### Device sync

Sync devices has a dedicated sidebar entry. An explanatory row introduces encrypted sync, followed by native setup fields and explicit enable, pairing-link, TV-code and recovery choices. Linked devices show connection state, QR/link pairing, a six-digit TV approval flow and divider-separated device rows with Unlink actions. Keep recovery codes behind an explicit disclosure after initial creation. Pairing QR codes use a white quiet zone for scan reliability; no other saturated colors are introduced. On mobile the pairing columns stack, input fields remain full-width and device actions stay reachable. Offline and revoked states retain local data and explain recovery.


Sync onboarding is progressive: Start syncing is the first-device action; Connect this device is the returning-user action. A publisher default or same-origin relay is discovered automatically, with device names suggested locally. Scanned links open a clean confirmation instead of exposing encoded keys. QR instructions, TV approval and recovery files use plain language; technical fields remain in Advanced settings. An unavailable service is explained beside the disabled action, while local progress remains intact.


### Discover shelf browsing

Discovery shelves use compact round arrows beside the shelf heading that advance almost one visible row, touch and trackpad scrolling, and left/right keyboard movement between focused covers. Load the next catalog page automatically near the end; keep a compact loading indicator and explicit retry on failure. Search and Library grids retain their layout and load near the last visible result. Remove Load more from row headings. Title details provide previous/next controls within the originating shelf, fetching another page when needed. Closing details retains shelf scroll; pending navigation must not reopen a closed dialog.

Poster cards keep title and year/type together without reserved blank title rows. Completed playback uses a small Watched badge on the cover, including episode context for series, rather than a 100% track. Unfinished playback shows a thin inset track at the bottom of the artwork and one compact episode/time-left line below the metadata. Controls never cover the artwork with tall side panels.

Shelf headings open a dedicated full collection grid with automatic loading as the last row approaches and Back to Discover. Search orders normalized exact names and anime aliases first, then word matches and popularity. Include anime without IMDb vote counts in Top results; enforce exact priority in the local database before limiting the result page.


### Shared Apple-inspired controls

Action buttons use consistent 44px minimum heights, neutral primary/secondary fills, 12px corners and white keyboard focus. Icon actions are 44px circles. Segmented controls use an inset grey selected surface. All single-select dropdowns share the same rounded trigger and a dark 16px-radius, scrollable picker with grey hovered/selected options and white checkmarks; use native customizable select where supported, retaining native keyboard/type-ahead/change semantics and standard select fallback elsewhere. Apply the same system to genres, Live TV servers, seasons, source sorting/quality, Progress sorting, audio, subtitles and playback settings. Keep cards, calendar cells, media artwork, toggles and caption-color swatches semantically distinct.

Cast uses horizontally scrollable neutral person buttons with actor name, character role and a simple avatar. Clicking opens an actor credit grid with a Movies/TV series filter and Back to Discover. Search lists Actors separately above title results. Expose index preparation, errors and Retry without blocking sources, episode selection or ordinary title search.

Actor photos are fetched independently of credits, matched through IMDb IDs and cached in a separate photo database. Cast and actor-search cards use circular portraits; actor pages use a larger portrait and a visible photographer/license link to the Commons source. Fall back to the avatar on missing photos or failed images; keep actor navigation available throughout.
