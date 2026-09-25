# Aurelia feature map

How to reach every feature of the app, so vague bug reports can be pinned to a
place. Update this file whenever behavior changes. Live app:
https://aeiouvcode.github.io/aurelia

## Page layout (index.html)

- **Header** - brand, score picker (`#pick`).
- **Piece heading** - title (`#title`), composer (`#by`), piece note (`#note`,
  defaults to "<n> staves · <n> notes").
- **Score area** (`.scorewrap`) - view toggle and the engraved score.
- **Status line** (`#status`) - progress and errors (`.err` = red).
- **Mixer** (`<details>`) - per-staff sliders, follow checkbox.
- **Play your own score** (`<details id="abcBox">`) - file open + ABC input.
- **What you are hearing** (`<details>`) - static credits text.
- **Transport footer** - play/pause, seek bar, time, Download WAV, saved link.

## Features and how to trigger them

### Choosing a piece
- Score picker (`#pick`, top right): Lacrimosa, Ode to Joy, Prelude in C
  (library defined in `LIB` at the top of `js/app.js`, files in `scores/`).
- URL: `?score=<id>` where id is `lacrimosa`, `ode`, or `prelude`. Unknown or
  missing value falls back to Lacrimosa.
- Own score: "Play your own score" > file button accepts MusicXML
  (.musicxml/.xml/.mxl), MEI, or ABC (.abc/.txt); or edit the ABC textarea and
  press "Play this ABC".

### Engraved score
- Rendered by Verovio into `#score` as SVG. Re-renders on window resize
  (250 ms debounce) and on view change.
- **View toggle** (`#viewSeg`): "Vocal score" / "Full score". Only appears for
  MusicXML pieces that have a choir; hidden otherwise.
- **Click a note** in the score to seek playback to that note's onset
  (uses Verovio element timings).
- On narrow screens (<720 px) part names are replaced by their abbreviations.

### Playback
- Play/pause button (`#play`, bottom left). Space is NOT bound; click only.
- Seek bar (`#seek`): drag to scrub (shows time preview), release to seek.
  Seeking restarts playback from the new position if it was playing.
- Time display (`#time`): `m:ss / m:ss`.
- **Highlight sync**: sounding notes get the `.hl` class in the SVG; when
  "Page follows the music" (`#follow`, in Mixer) is checked, the page scrolls
  to the current measure.
- Instruments are chosen from written part names (`instrumentFor` in
  `js/engine.js`): strings/winds/brass/timpani/piano/organ are CC0 samples
  (`samples/`), voices (soprano/alto/tenor/bass/choir labels) are the
  synthesized ensemble choir.

### Mixer
- "Mixer" details: one slider per staff, live during playback
  (`Engine.setLevel`). Slider state persists for the loaded piece only.

### WAV export
- "Download WAV" (`#wav`): renders the whole piece offline (parallel slices,
  44.1 kHz stereo 16-bit, peak-normalized to 0.98), then reveals the `#saved`
  download link. Deterministic: the same score exports the same take.

## Diagnostics for bug reports

- `window.Aurelia`: `events`, `parts`, `endSec`, `seekTo(frac)`,
  `toggle()`, `download()` - console handles for the loaded piece.
- Test flags (set before render): `AURELIA_DRY` (mute the hall),
  `AURELIA_SLICES` (override slice count), `AURELIA_NOSUSP` (disable render
  batching), `AURELIA_SINGERS` (voices per choir note, default 12).
- Status line shows load/render progress; console errors are real errors.
- Error and empty states (all in the status line, never raw errors): unreadable
  score file, wrong file type, bad ABC, audio start failure, sample load
  failure, render out-of-memory, missing library score, and "That score has
  no notes Aurelia can play." for a score that parses but yields zero notes.
- `favicon.svg` - wine beamed-notes mark, linked from index.html and 404.html.
- `404.html` - themed not-found page ("A rest, not a note") with a link home;
  GitHub Pages serves it for unknown paths.
- A stale score load (superseded by a newer one) never touches the status
  line or the current piece - guarded by a load generation counter.

## Quality checklist (standing, verified every behavior change)

1. Favicon present and fetching 200.
2. Real page title and meta description.
3. Themed 404.html for unknown paths.
4. No placeholder text anywhere user-visible.
5. Honest empty/success/error states; no raw stack traces or error objects
   shown to the user (traces go to console.error only).
6. FEATURE-MAP.md updated when behavior changes.

## Code map

- `js/app.js` - UI, score loading/parsing (MusicXML/MEI via Verovio, ABC),
  event extraction (notes, dynamics, lyrics), highlight/transport.
- `js/engine.js` - audio: sample player, synthesized choir, hall, mixer
  graph, realtime transport, offline WAV render.
- `scores/` - built-in written scores (MusicXML, hand-written for Aurelia).
- `samples/` - CC0 instrument sample sets (VSCO-2 CE, VCSL).
- `lib/` - Verovio wasm engraving toolkit.
- `NOTICE.txt` - sample credits. `docs/` - design notes.
