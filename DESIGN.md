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
  control: "5px"
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

Primary buttons use a solid medium grey surface with white text. Secondary buttons use opaque grey surfaces with fine borders. Keep interface colors neutral; do not reintroduce blue or cyan into app chrome.

## Typography

Use Manrope for headings and DM Sans for controls and body text. Body and poster titles remain 16px; common supporting text is 13–15px. Shelf headings are 24px, page headings 32–36px, and source-provider names 17px. The spotlight has its separate large, widely tracked title. Keep useful information readable at ordinary browser zoom.

## Layout

Desktop uses a 240px fixed rail and 92px header. The rail narrows to 216px, then icon rails of 76px and 64px on smaller screens. Media shelves show five posters by default, six at 1600px, four below 1150px, and two on mobile. Swipe, trackpad, keyboard focus and arrow navigation remain available; native horizontal scrollbars are hidden. Poster titles can wrap to two lines without reserving empty height; year/type metadata follows with a 5px margin.

The quality-first selector sits inside title details. Its order is heading and explanation, Quality and Sort by dropdowns, selected-tier count, then source rows. Desktop dropdowns are side by side; mobile stacks them. Source rows use icon, information and Play columns; Play moves below information on mobile. The close button stays visible as the dialog scrolls.

The calendar keeps a seven-column month grid and readable agenda. Its tracked-title list retains movie, series and anime entries; on mobile each release date moves below its title. Extensions continue to use divider-separated rows and a stacking installation form.

## Elevation & Depth

Most hierarchy comes from surface color and thin dividers. Photography uses dark directional shading. Dialogs retain their dark backdrop and existing soft shadow; source rows use no individual shadows. Hover and focus remain distinct. Reduced-motion preference disables animation and smooth scrolling.

## Shapes

Controls and source rows use compact 4–5px corners. Posters use 7px corners; dialogs use 9px corners. Small codec and release-format chips use 3px corners. Avatars and today/saved markers remain circular.

## Components

### Quality-first playback

Only qualities supplied by sources appear. Known tiers are 720p, 1080p, 2K/1440p, 4K/2160p and SD. Unspecified quality stays explicit. Default to 1080p when available, then 720p. Selecting a quality filters the source list; it does not start playback. Sorting uses seeders or actual file size, with unknown sizes last.

Each row shows provider, release format and codec where known, then size and seeders. Long release filenames and original extension details remain under the native Release details disclosure. Play performs the existing playback action. Empty, loading, partial-failure and unsupported-source states remain explicit.

### Controls and accessibility

Use native labeled selects with consistent grey field treatment and 48px minimum height. Default action buttons remain 46px high; source Play actions are at least 44px. Focus uses a 2px white outline with a 4px offset. Icon-only controls retain accessible names.

### Browsing and feedback

Poster shelves retain saved marks, keyboard focus and hover overlays. Toasts, buffering and extension settings inherit the grey surfaces. The torrent buffering screen keeps cancellation visible, supports file selection and shows actionable failure recovery. Its status strip shows actual peer and transfer data.

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
