# Aurelia

A score-first orchestra for the browser. Aurelia reads a written score, engraves it, plays it with sampled instruments and a synthesized choir, lights up each note as it sounds, and renders the whole performance to a WAV file.

![Aurelia playing Mozart's Lacrimosa, with the choir's first notes highlighted](docs/screenshot.jpg)

**Live:** https://aeiouvcode.github.io/aurelia/

## How it works

- **The score comes first.** Every bundled piece is a MusicXML file written for Aurelia. Playback is driven by that score, not by MIDI files or recordings.
- **Engraved view.** Verovio draws the notation in the page. Switch between a vocal score and the full score. The note being played is highlighted as the music moves.
- **Real instruments.** Strings, winds, brass, timpani, organ and piano come from the CC0 Versilian Studios libraries, bundled in `samples/`.
- **Synthesized choir.** There is no clean, openly licensed choir sample set, so the voices are built in the browser from a glottal source and vowel formants. It is the least realistic part of the sound.
- **Mixer and export.** Balance each section, then download the full performance as a WAV, rendered offline on your device.

Bundled pieces: Mozart's Lacrimosa (choir and orchestra), Beethoven's Ode to Joy, and Bach's Prelude in C. You can also open your own score as MusicXML (`.musicxml`, `.xml`, `.mxl`), MEI or ABC.

Everything runs in the page. No accounts, no server, no tracking.

## Run locally

```sh
git clone https://github.com/aeiouvcode/aurelia.git
cd aurelia
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Credits

Sources and licenses for the scores, samples and engraver are listed in [NOTICE.txt](NOTICE.txt). Verovio is LGPL-3.0-or-later; the samples are CC0.
