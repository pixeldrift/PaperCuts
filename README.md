# PaperCuts

Text-based rough-cut editor: select lines from time-coded transcripts and assemble them like a document.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Branding
The shipped app icons, favicon, PWA manifest icons and top-bar wordmark are generated from the concept image (`brand/source/concept.jpg`):

```bash
pip install pillow numpy
python3 brand/make_icons.py   # → public/icons/*, public/brand/wordmark.png
```
It's a raster, so large sizes are a little soft — replace the source image (or the whole pipeline) when final art exists.

A **vector retrace** of the mark (flat colours, outlined text) is kept in `brand/icon.py` + `brand/build.py` and writes to `brand/vector/` — not shipped yet, for when we want crisp resolution-independent art:

```bash
pip install fonttools brotli uharfbuzz
python3 brand/build.py          # default: Outfit Light + Space Grotesk Bold; or: sora, dmsans, manrope, lexend, fraunces
node brand/render.cjs           # PNG previews (needs playwright)
```

## Importing sources
Drop files on the Sources panel, press the **+** button, or use `Cmd/Ctrl+I`.
- Media: mp4, m4v, mov, webm, mkv, mp3, m4a, wav, ogg (what actually plays depends on the browser's codecs; webm/mp4-h264 are safest).
- Transcripts: `.srt` / `.vtt` (cue-level — words are timed by spreading each cue over its words), or `.json` with word timings (`[{word,start,end}]`, `{words:[…]}` or Whisper-style `{segments:[…]}`; seconds or milliseconds).
- Files are paired by name (`interview.mp4` + `interview.srt`), or automatically if you drop exactly one of each.
- Sources with no media still work using simulated playback.

- `/#icons` shows the icon set redrawn from the wireframe sheet.
- Sources with media play through real `<video>`; sources without media fall back to simulated playback (`store.tick`). `components/Viewer.tsx` handles both, including sequencing clips across files.
- Sample sources/transcripts are generated in `src/data/sample.ts`.

## Trimming
Select a clip to reveal faded words of source context around it. Drag the left/right handle over the text to move the in/out point (one undo step per drag). A plain click on a handle opens **Refine** for ±1 frame (Shift = ±10; also ←/→ while open).

## Multicam
Footage of the same take from different cameras is **one clip with several angles** — you cut from one shared transcript and choose the angle per clip.

- **Sync on import:** drop several videos (or external audio) with one transcript and they become angles A, B, C… of a single clip.
- **Sync later:** *Select* → tick the clips that are the same take → *Sync as multicam*. **Every transcript is kept** (each camera keeps its own); the **longest** becomes the primary one, and the others automatically fill in whatever it doesn't cover (*Combine* is on by default). Clips already in the edit are re-pointed to the matching angle.
- **Unsync** (Clip info) splits angles back out. A split-out camera gets **its own original transcript**; if it never had one it gets a copy of the shared transcript (re-timed to its footage) — until you choose **Remove transcript**. A clip left with one camera reverts to its own transcript.
- **Choose the angle:** every clip in the Paper Edit has angle chips (A · B · GoPro); with a clip selected, **1–9** picks its Nth camera. The Source pane has a *Preview angle* switch and the timeline shows each clip's camera. Playback uses the chosen angle's video.

### Sync editor (Sources → *Sync*, or Clip info → *Sync editor*)
A multicam grid (security-camera style) over a nested timeline of its own, stacked:
- **Cameras & audio** — one lane per camera with its waveform (decoded from the real audio; simulated for sample footage). **Drag a lane** (or use the ‹ › / « » frame nudges, or type milliseconds) to line it up with the others. *+ Camera / audio* links more footage, including external audio-only recordings. The playhead plays every camera together at its own offset; click a speaker to choose which one you hear.
- **Transcripts, aligned in time** — each camera's own transcript, with **every word placed at its time** (zoom in, or press *Show words*). The same word in two tracks lines up vertically; words that have a match in another track are underlined, and hovering one highlights its twins — so you can *see* whether two cameras are in sync. *Link transcript…* attaches one, *Remove* drops it; pick which is **Primary**.
- **Align by words** — slide a camera so its words land on the same words in the primary transcript (matches words the two transcripts share and finds the constant time difference; works with noise and partial transcripts). *Auto-align by words* does every camera at once. Cameras without a transcript still have to be lined up by hand (or by their waveforms).
- **Words on audio** — a toggle that draws each camera's words over its waveform so a camera takes only one lane (the transcript controls move into the camera's label). Remembered between sessions.
- **Shared transcript** — what the whole app edits from. **Only one transcript is active at any point.** With *Combine all transcripts* on, the primary's transcript is used where it exists and other transcripts fill in what it doesn't cover (a camera that rolled early or kept rolling), so the shared transcript spans the entire duration.
- If a camera rolled *before* the others, dragging it earlier **rebases the timeline** so it starts at 0 — clips already in your edit are shifted by the same amount so they stay on the same footage.
- Applying a change that rebuilds the shared transcript warns first if you've hand-edited its text.
- In the Sources list, *Combine synced clips* (default) shows one row per clip with its angles under a twirl-down.

## Slate metadata
Scene, Take, Director, DP / Camera op and Interviewer — edit them in Clip info; show them as columns (Options) and search across them.

## Clip info (edit metadata)
**Double-click** a clip's data (anything except the thumbnail/title), or **press and hold** a row (or right-click, or press `I`), to edit its title, date, and per-angle camera, shot type, filename, time recorded and sync offset. Double-click the thumbnail/title still opens the clip.

## Sources list
- **Double-tap / double-click** the thumbnail or title to open a clip — on a phone that switches to the Source tab. A single tap just selects it.
- **Sortable headers:** each header is a button with stacked ▲▼ arrows that are faded until the column is the sort column, then the active direction lights up. Click cycles ascending → descending → off.
- **Options** (next to Remove): show/hide columns — Thumbnail, Title, Duration, Date, Time recorded, Camera, Shot type, Filename, Transcript (✓ + format), Multicam. Settings are remembered. Title/thumbnail stay pinned while the table scrolls sideways.

## Panes & timelines
Each pane has its own colour, icon and small-caps label (Source = violet, Paper Edit = teal, Timeline = amber), and the same colours mark the active top tab / phone nav tab. The paper edit has a mini timeline strip (tap or drag to scrub) and the Timeline view has a ruler with tick marks and times — tap or drag the ruler, or tap a clip, to move the current time. Timeline clips show a thumbnail, the source name and a wrapped, truncated preview of the clip's text; clip colours are per source.

## Transcript editing
Press **T** (or *Edit Text*) in either pane.

- **Swap a word:** click it, type, **Enter**. Tab / Shift+Tab saves and moves to the next / previous word; **Esc** cancels (Esc again leaves the mode).
- **Edit the whole transcript:** *Edit full text* opens it as plain text — every line is a paragraph, so **Enter adds a paragraph break** (and joining lines removes one). **Cmd/Ctrl+Enter** applies.
- **Paragraph breaks word-by-word:** **Shift+Enter** in a word editor breaks the paragraph after that word (or joins, if there's already a break).
- **Find & replace:** `Cmd/Ctrl+F` (or *Find*). Phrases work, with *Match case*, *Whole word* and *All sources*. Matches are highlighted; *Replace* does the current match, *Replace all* does every match (across all sources if ticked) as a single undo step.

### How new words are timed
Unchanged words keep their exact timing, so clips and trims stay put. For anything new:
- a word swapped 1-for-1 keeps the old word's timing;
- otherwise the new words **share the time between the unchanged words on either side of the edit, divided evenly**;
- if that gap is too small to fit them (min ~120 ms per word), the neighbouring words each give up a little time (never dropping below ~80 ms).

Edits autosave and are undoable. The logic lives in `src/lib/textdiff.ts` (word-level diff + timing, find/replace) and is pure, so it's easy to test.

## Undo / redo
`⌘Z` / `⌘⇧Z`, or the Undo / Redo buttons in the top bar (also on phones). History covers clip edits, trims, notes **and** transcript text.

## Shortcuts
`,` insert · `.` overwrite · `Q`/`W` trim in/out · `R` refine · `K` cut · `G` glue · `X` remove clip · `N`/`C` note/comment · `Space` play · `T` edit transcript · `⌘F` find & replace · `⌘Z` undo · `⌘⇧Z` redo · `⌘S` save · `+`/`-` text size

## Roadmap

**Next**
- ~~Real media playback with `<video>`; import media + SRT/VTT/JSON transcripts (drag-and-drop)~~ — done (see below)
- ~~Persist imported sources, media and the edit (IndexedDB)~~ — done; autosaves, survives reloads
- Formal media-provider interface (`play`, `seek`, `currentTime`, `duration`, `onTick`) so YouTube etc. can plug in; gapless clip sequencing via two preloaded players
- ~~Drag-to-trim clip handles~~ — done; select a clip, drag a handle over the faded context words (click a handle for frame-level Refine)
- ~~Story notes and comments as inline editors~~ — done (`N` / `C` on a selected clip; Enter saves, Esc cancels, empty text deletes)
- Multiple named edits; storage-usage / manage-media screen
- ~~Transcript editing~~ — done (`T`): click a word to fix it; Space splits, empty deletes, Tab moves on

**Later**
- **YouTube sources (super rough cut):** let people use their own YouTube videos as sources for quick, shareable rough cuts, aimed at users who don't already have a review workflow such as Frame.io.
  - Second media provider built on the YouTube IFrame Player API (paste a URL)
  - Transcripts for the user's own videos via OAuth (`captions.download`), or imported SRT/VTT / third-party transcription
  - Known limits: clip transitions aren't gapless (seek/buffering), timing is approximate (no frame-accurate trim), and the final cut can't be rendered from YouTube video, so share via EDL/XML export or a playable link to the edit
- Export: EDL / FCPXML / Premiere XML; optional in-browser render (ffmpeg.wasm)
- Transcription via Whisper / Deepgram / AssemblyAI (serverless function)
- Persistence and sync beyond `localStorage`; PWA install
