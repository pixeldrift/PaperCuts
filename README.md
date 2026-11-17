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

## Sources list
- **Double-tap / double-click** a source to open it — on a phone that switches to the Source tab. A single tap just selects it.
- **Sortable headers:** each header is a button with stacked ▲▼ arrows that are faded until the column is the sort column, then the active direction lights up. Click cycles ascending → descending → off.
- **Options** (next to Remove): show/hide columns — Thumbnail, Title, Duration, Date, Time recorded, Camera, Shot type, Filename, Transcript (✓ + format), Multicam — and **Combine synced clips**, which groups multicam angles into one row with a twirl-down to see each angle. Settings are remembered. Title/thumbnail stay pinned while the table scrolls sideways.
- Sources sharing a `syncId` are treated as the same take from different angles (sample data: Jane Smith on A, B and GoPro).

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
