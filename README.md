# PaperCuts

Text-based rough-cut editor: select lines from time-coded transcripts and assemble them like a document.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

- `/#icons` shows the icon set redrawn from the wireframe sheet.
- Playback is **simulated** (no media yet). `store.tick` + `components/Viewer.tsx` are the seams to replace with real `<video>` elements.
- Sample sources/transcripts are generated in `src/data/sample.ts`.

## Shortcuts
`,` insert · `.` overwrite · `Q`/`W` trim in/out · `R` refine · `K` cut · `G` glue · `X` remove clip · `N`/`C` note/comment · `Space` play · `⌘Z` undo · `⌘S` save · `+`/`-` text size

## Roadmap

**Next**
- Real media: replace simulated playback with `<video>` behind a media-provider interface (`play`, `seek`, `currentTime`, `duration`, `onTick`); gapless clip sequencing via two preloaded players
- Import sources (drag-and-drop) and transcripts (SRT / VTT / word-level JSON)
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
