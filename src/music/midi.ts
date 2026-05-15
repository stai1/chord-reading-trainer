import type { DrawnAccidental, Note } from './types';

const LETTER_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function accidentalSemitone(acc: DrawnAccidental): number {
  switch (acc) {
    case 'double-flat':
      return -2;
    case 'flat':
      return -1;
    case 'sharp':
      return 1;
    case 'double-sharp':
      return 2;
    case 'natural':
    case null:
      return 0;
    default:
      return 0;
  }
}

/**
 * Convert a Note (whose octave is relative — root at octave 0) plus an
 * octave shift into a MIDI number. Uses scientific pitch (C4 = MIDI 60).
 */
export function noteToMidi(note: Note, octaveShift: number): number {
  const natural = LETTER_SEMITONE[note.letter];
  if (natural === undefined) {
    throw new Error(`Unknown letter "${note.letter}"`);
  }
  const absOctave = note.octave + octaveShift;
  return (absOctave + 1) * 12 + natural + accidentalSemitone(note.accidental);
}

/**
 * For the staff-range check (§3.3.2), we compare by letter-name position.
 * Returns the "letter index" of a note: MIDI-like but ignoring accidental.
 * For example A3 and A♭3 share the same letter index, A♯3 too.
 */
export function noteLetterIndex(note: Note, octaveShift: number): number {
  const natural = LETTER_SEMITONE[note.letter];
  if (natural === undefined) {
    throw new Error(`Unknown letter "${note.letter}"`);
  }
  const absOctave = note.octave + octaveShift;
  return (absOctave + 1) * 12 + natural;
}

// Reference letter indices for boundary ledger lines.
// "A3 line" = A3 letter position = MIDI 57 ignoring accidental.
// "C7" = letter index 96; C2 = 36; E4 line = 64.
export const TREBLE_LOW_LETTER = 57; // A3
export const TREBLE_HIGH_LETTER = 96; // C7
export const BASS_LOW_LETTER = 36; // C2
export const BASS_HIGH_LETTER = 64; // E4
