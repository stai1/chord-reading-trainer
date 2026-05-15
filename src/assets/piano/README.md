# Piano Samples

Audio samples used by all piano playback in the app — reveal-phase chord audio and user-played notes from MIDI keyboard / mouse / touch input. Full 88-key range coverage (A0–C8).

## Source

These samples are derived from the **Salamander Grand Piano** sample library, distributed under a Creative Commons license.

- Upstream repository: <https://github.com/sfzinstruments/SalamanderGrandPiano>
- Sample files used: `Samples/<note><octave>v8.flac` (velocity layer 8)
- Range: A0 through C8, with one sample per A / C / D♯ / F♯ in each octave (30 files total)

## Processing

**Filename note:** files originally named `D#<n>v8.flac` / `F#<n>v8.flac` upstream are stored here as `Ds<n>v8.opus` / `Fs<n>v8.opus` (lowercase `s` replacing `#`), since Vite's static import resolver treats `#` in a URL path as a fragment delimiter and fails to resolve the file.

Each upstream FLAC was converted to Ogg Opus by `scripts/convert-piano-samples.sh` (in the project root). The pipeline per sample is:

1. **Peak detection** — `ffmpeg -af volumedetect` measures the maximum sample amplitude in dBFS.
2. **Normalization** — a `volume=<0 − peak>dB` filter is applied so the resulting peak sits at 0 dBFS. This equalizes perceived loudness across the keyboard, since the upstream samples vary by ~11.6 dB across the range (A7 was the quietest at −18.6 dBFS, F♯1 the loudest at −7.0 dBFS).
3. **Re-encode** — Opus at 64 kbps VBR, stereo, 48 kHz, `-compression_level 10` (slowest/best quality), `-application audio` (music-tuned psychoacoustic model).

Resulting file size: ~3.4 MB total across all 30 samples (vs ~45 MB of source FLAC, ≈13× compression). Per-sample sizes range from ~25 KB (C8) to ~200 KB (low D♯2).

## Re-running the conversion

From the project root (one level above `chord-reading-trainer/`):

```bash
./scripts/convert-piano-samples.sh
```

The script reads raw FLACs from `<project-root>/src/assets/piano/` and writes Opus files into this directory.
