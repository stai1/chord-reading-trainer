import * as Tone from 'tone';
import A0 from '../assets/piano/A0v8.opus?url';
import A1 from '../assets/piano/A1v8.opus?url';
import A2 from '../assets/piano/A2v8.opus?url';
import A3 from '../assets/piano/A3v8.opus?url';
import A4 from '../assets/piano/A4v8.opus?url';
import A5 from '../assets/piano/A5v8.opus?url';
import A6 from '../assets/piano/A6v8.opus?url';
import A7 from '../assets/piano/A7v8.opus?url';
import C1 from '../assets/piano/C1v8.opus?url';
import C2 from '../assets/piano/C2v8.opus?url';
import C3 from '../assets/piano/C3v8.opus?url';
import C4 from '../assets/piano/C4v8.opus?url';
import C5 from '../assets/piano/C5v8.opus?url';
import C6 from '../assets/piano/C6v8.opus?url';
import C7 from '../assets/piano/C7v8.opus?url';
import C8 from '../assets/piano/C8v8.opus?url';
import Ds1 from '../assets/piano/Ds1v8.opus?url';
import Ds2 from '../assets/piano/Ds2v8.opus?url';
import Ds3 from '../assets/piano/Ds3v8.opus?url';
import Ds4 from '../assets/piano/Ds4v8.opus?url';
import Ds5 from '../assets/piano/Ds5v8.opus?url';
import Ds6 from '../assets/piano/Ds6v8.opus?url';
import Ds7 from '../assets/piano/Ds7v8.opus?url';
import Fs1 from '../assets/piano/Fs1v8.opus?url';
import Fs2 from '../assets/piano/Fs2v8.opus?url';
import Fs3 from '../assets/piano/Fs3v8.opus?url';
import Fs4 from '../assets/piano/Fs4v8.opus?url';
import Fs5 from '../assets/piano/Fs5v8.opus?url';
import Fs6 from '../assets/piano/Fs6v8.opus?url';
import Fs7 from '../assets/piano/Fs7v8.opus?url';

const SAMPLE_MAP: Record<string, string> = {
  // Tone.Sampler keys are pitch names; values are the bundled URL strings.
  // Full 88-key range coverage (A0 - C8) via A / C / D# / F# samples per octave.
  A0, A1, A2, A3, A4, A5, A6, A7,
  C1, C2, C3, C4, C5, C6, C7, C8,
  'D#1': Ds1,
  'D#2': Ds2,
  'D#3': Ds3,
  'D#4': Ds4,
  'D#5': Ds5,
  'D#6': Ds6,
  'D#7': Ds7,
  'F#1': Fs1,
  'F#2': Fs2,
  'F#3': Fs3,
  'F#4': Fs4,
  'F#5': Fs5,
  'F#6': Fs6,
  'F#7': Fs7,
};

let sampler: Tone.Sampler | null = null;
let loadPromise: Promise<void> | null = null;

export function getSampler(): Tone.Sampler {
  if (sampler) return sampler;
  // Chain: Sampler -> Gain (0.3 multiplier) -> Limiter (catches stacked-chord peaks) -> destination
  const gain = new Tone.Gain(0.3);
  const limiter = new Tone.Limiter(0); // ceiling at 0 dBFS
  gain.connect(limiter);
  limiter.toDestination();
  sampler = new Tone.Sampler({
    urls: SAMPLE_MAP,
    release: 1.5,
  });
  sampler.connect(gain);
  loadPromise = Tone.loaded();
  return sampler;
}

export async function waitForSamples(): Promise<void> {
  getSampler();
  if (!loadPromise) return;
  await loadPromise;
}

/**
 * Convert a MIDI number to a Tone.js frequency string ("C4" etc).
 */
export function midiToFreqStr(midi: number): string {
  const LETTERS_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${LETTERS_SHARP[pc] ?? 'C'}${octave}`;
}

/**
 * Play a list of MIDI notes; returns a function to release them.
 */
export function playChord(midis: number[]): () => void {
  const s = getSampler();
  const freqs = midis.map(midiToFreqStr);
  // Ensure context is started (user gesture)
  if (Tone.getContext().state !== 'running') {
    Tone.start();
  }
  s.triggerAttack(freqs);
  return () => {
    s.triggerRelease(freqs);
  };
}
