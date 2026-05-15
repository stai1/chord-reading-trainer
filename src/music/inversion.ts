import type { Note } from './types';

/**
 * Apply inversion k (0 <= k <= N-1) to a chord.
 * Rotates k leading notes by raising their octave by 1 and moving them to
 * the end of the list. If the resulting first-note octave is no longer 0,
 * shift everything down so the first note is at octave 0.
 */
export function applyInversion(notes: Note[], k: number): Note[] {
  if (k < 0 || k >= notes.length) {
    throw new Error(`Invalid inversion ${k} for N=${notes.length}`);
  }
  if (k === 0) {
    return notes.map((n) => ({ ...n }));
  }

  const rotated: Note[] = [
    ...notes.slice(k).map((n) => ({ ...n })),
    ...notes.slice(0, k).map((n) => ({ ...n, octave: n.octave + 1 })),
  ];

  // Normalize so first note is at octave 0.
  const firstOctave = rotated[0]?.octave ?? 0;
  if (firstOctave !== 0) {
    for (const n of rotated) {
      n.octave -= firstOctave;
    }
  }

  return rotated;
}
