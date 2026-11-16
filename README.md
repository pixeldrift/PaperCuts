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
