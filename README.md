# PaperCuts

Text-based rough-cut editor: select lines from time-coded transcripts and assemble them like a document.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
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

## Shortcuts
`,` insert · `.` overwrite · `Q`/`W` trim in/out · `R` refine · `K` cut · `G` glue · `X` remove clip · `N`/`C` note/comment · `Space` play · `⌘Z` undo · `⌘S` save · `+`/`-` text size

## Roadmap

**Next**
- ~~Real media playback with `<video>`; import media + SRT/VTT/JSON transcripts (drag-and-drop)~~ — done (see below)
- Persist imported sources (IndexedDB / OPFS) so they survive a reload — currently they live only for the session
- Formal media-provider interface (`play`, `seek`, `currentTime`, `duration`, `onTick`) so YouTube etc. can plug in; gapless clip sequencing via two preloaded players
- Drag-to-trim clip handles; story notes and comments as inline editors
- Transcript editing

**Later**
- **YouTube sources (super rough cut):** let people use their own YouTube videos as sources for quick, shareable rough cuts, aimed at users who don't already have a review workflow such as Frame.io.
  - Second media provider built on the YouTube IFrame Player API (paste a URL)
  - Transcripts for the user's own videos via OAuth (`captions.download`), or imported SRT/VTT / third-party transcription
  - Known limits: clip transitions aren't gapless (seek/buffering), timing is approximate (no frame-accurate trim), and the final cut can't be rendered from YouTube video, so share via EDL/XML export or a playable link to the edit
- Export: EDL / FCPXML / Premiere XML; optional in-browser render (ffmpeg.wasm)
- Transcription via Whisper / Deepgram / AssemblyAI (serverless function)
- Persistence and sync beyond `localStorage`; PWA install
