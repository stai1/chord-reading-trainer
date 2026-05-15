import type { Note } from './types';
import {
  noteLetterIndex,
  TREBLE_LOW_LETTER,
  TREBLE_HIGH_LETTER,
  BASS_LOW_LETTER,
  BASS_HIGH_LETTER,
} from './midi';

export interface PlacementRange {
  lowLetter: number;
  highLetter: number;
}

export const TREBLE_RANGE: PlacementRange = {
  lowLetter: TREBLE_LOW_LETTER,
  highLetter: TREBLE_HIGH_LETTER,
};

export const BASS_RANGE: PlacementRange = {
  lowLetter: BASS_LOW_LETTER,
  highLetter: BASS_HIGH_LETTER,
};

/**
 * Find octave shifts (relative to the unshifted chord) that place all notes
 * within the given range by letter-name position.
 */
export function validOctaveShifts(
  notes: Note[],
  range: PlacementRange,
): number[] {
  if (notes.length === 0) return [0];
  const shifts: number[] = [];
  // Try a sensible window of shifts.
  for (let shift = -2; shift <= 8; shift++) {
    let ok = true;
    for (const n of notes) {
      const idx = noteLetterIndex(n, shift);
      if (idx < range.lowLetter || idx > range.highLetter) {
        ok = false;
        break;
      }
    }
    if (ok) shifts.push(shift);
  }
  return shifts;
}

/**
 * Pick a random valid octave shift, or fall back to the closest-fitting one
 * (force-fit per §3.3.2).
 */
export function pickOctaveShift(
  notes: Note[],
  range: PlacementRange,
  rng: () => number,
): number {
  const valid = validOctaveShifts(notes, range);
  if (valid.length > 0) {
    const shift = valid[Math.floor(rng() * valid.length)];
    return shift ?? 0;
  }
  // Force-fit: pick the shift minimizing range violation.
  let best = 0;
  let bestPenalty = Infinity;
  for (let shift = -4; shift <= 12; shift++) {
    let penalty = 0;
    for (const n of notes) {
      const idx = noteLetterIndex(n, shift);
      if (idx < range.lowLetter) penalty += range.lowLetter - idx;
      if (idx > range.highLetter) penalty += idx - range.highLetter;
    }
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = shift;
    }
  }
  return best;
}

/** Apply an octave shift in-place to a chord (returns new array). */
export function shiftOctaves(notes: Note[], shift: number): Note[] {
  return notes.map((n) => ({ ...n, octave: n.octave + shift }));
}
