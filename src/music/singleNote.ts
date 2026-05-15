import type { Accidental, DrawnAccidental, KeySignature, Note } from './types';
import { diatonicAccidentalFor, scaleDegreeLetter } from './chordToNotes';

const LETTER_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Build a single-note exercise from a scale degree (1-7) and applied
 * accidental (flat/null/sharp).
 *
 * Implements §3.1.1: the rendered note's letter is the diatonic letter at
 * that scale degree; the drawn accidental is the symbol needed to bridge the
 * diatonic pitch and the applied target pitch.
 *
 * Returns a Note with octave 0 (root-like). Octave placement happens later.
 */
export function generateSingleNote(
  key: KeySignature,
  scaleDegree: number,
  applied: Accidental,
): Note {
  const letter = scaleDegreeLetter(key, scaleDegree);
  const naturalSemi = LETTER_SEMITONE[letter];
  if (naturalSemi === undefined) {
    throw new Error(`Unknown letter "${letter}"`);
  }
  const diatonicAcc = diatonicAccidentalFor(letter, key);
  const diatonicSemi = naturalSemi + diatonicAcc;
  const appliedDelta = applied === 'flat' ? -1 : applied === 'sharp' ? 1 : 0;
  const targetSemi = diatonicSemi + appliedDelta;
  const drawnDelta = targetSemi - naturalSemi;

  let acc: DrawnAccidental;
  switch (drawnDelta) {
    case -2:
      acc = 'double-flat';
      break;
    case -1:
      acc = 'flat';
      break;
    case 0:
      // Per §3.1.1: a natural sign must be drawn if the letter is altered
      // by the key signature, otherwise no accidental is drawn.
      acc = diatonicAcc === 0 ? null : 'natural';
      break;
    case 1:
      acc = 'sharp';
      break;
    case 2:
      acc = 'double-sharp';
      break;
    default:
      throw new Error(`Unexpected drawn delta ${drawnDelta}`);
  }

  return {
    letter,
    accidental: acc,
    octave: 0,
  };
}
