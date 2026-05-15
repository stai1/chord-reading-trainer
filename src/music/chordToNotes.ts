import type { Accidental, DrawnAccidental, KeySignature, Note, Quality } from './types';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

/** Semitones above C for each letter (natural). */
const LETTER_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Order of sharps in a key signature. */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
/** Order of flats in a key signature. */
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/**
 * Returns the diatonic accidental (-1 flat, 0 natural, +1 sharp) for a given
 * letter name under the given key signature.
 */
export function diatonicAccidentalFor(letter: string, key: KeySignature): number {
  const fifths = key.fifths;
  if (fifths > 0) {
    const sharped = SHARP_ORDER.slice(0, fifths);
    return sharped.includes(letter) ? 1 : 0;
  } else if (fifths < 0) {
    const flatted = FLAT_ORDER.slice(0, -fifths);
    return flatted.includes(letter) ? -1 : 0;
  }
  return 0;
}

/** Major-mode tonic letter for a given key signature. */
function majorTonicLetter(key: KeySignature): string {
  // Strip the ♭/♯ from key.majorTonic and return the letter.
  return key.majorTonic.charAt(0);
}

/**
 * Returns the letter name of scale degree N (1-7) of the key's major mode.
 */
export function scaleDegreeLetter(key: KeySignature, degree: number): string {
  const tonic = majorTonicLetter(key);
  const tonicIndex = LETTER_INDEX[tonic];
  if (tonicIndex === undefined) {
    throw new Error(`Unknown tonic letter "${tonic}"`);
  }
  const letter = LETTERS[(tonicIndex + (degree - 1)) % 7];
  if (letter === undefined) {
    throw new Error(`Invalid scale degree ${degree}`);
  }
  return letter;
}

/**
 * Returns the diatonic pitch (in semitones above C) for a scale degree of
 * the key's major mode.
 */
function diatonicSemitone(key: KeySignature, degree: number): number {
  const letter = scaleDegreeLetter(key, degree);
  const natural = LETTER_SEMITONE[letter];
  if (natural === undefined) {
    throw new Error(`Unknown letter "${letter}"`);
  }
  const acc = diatonicAccidentalFor(letter, key);
  return natural + acc;
}

/** Convert accidental enum to semitone offset. */
export function accidentalDelta(accidental: Accidental): number {
  if (accidental === 'flat') return -1;
  if (accidental === 'sharp') return 1;
  return 0;
}

/**
 * Map a target delta (drawnDelta = target semitone minus letter natural)
 * and the key signature to a DrawnAccidental.
 *
 * Per §3.1.1 a natural sign must be drawn if the letter is altered by the
 * key signature but the target pitch is the plain natural letter. We pass
 * `letter` and `key` so we know whether 'natural' (♮) vs null is appropriate.
 */
function deltaToDrawnAccidental(
  delta: number,
  letter: string,
  key: KeySignature,
): DrawnAccidental {
  if (delta === -2) return 'double-flat';
  if (delta === -1) return 'flat';
  if (delta === 0) {
    // If the key signature would alter this letter, an explicit natural is required.
    const kAcc = diatonicAccidentalFor(letter, key);
    return kAcc === 0 ? null : 'natural';
  }
  if (delta === 1) return 'sharp';
  if (delta === 2) return 'double-sharp';
  throw new Error(`Unsupported delta ${delta}`);
}

/**
 * The quality's interval pattern in semitones between successive chord tones.
 */
const QUALITY_INTERVALS: Record<Quality, number[]> = {
  major: [4, 3],
  minor: [3, 4],
  diminished: [3, 3],
  augmented: [4, 4],
  'diminished-7th': [3, 3, 3],
  'half-diminished-7th': [3, 3, 4],
  'minor-7th': [3, 4, 3],
  'minor-major-7th': [3, 4, 4],
  'dominant-7th': [4, 3, 3],
  'major-7th': [4, 3, 4],
  'augmented-major-7th': [4, 4, 3],
};

/**
 * chordToNotes(keySignature, root, accidental, quality) -> Note[]
 *
 * Implements §3.2.3. The root note is at octave 0; subsequent notes ascend.
 * Octave increments when the next letter wraps around (i.e., is "lower" in
 * pitch-class letter order than the previous).
 */
export function chordToNotes(
  key: KeySignature,
  root: number,
  accidental: Accidental,
  quality: Quality,
): Note[] {
  const intervals = QUALITY_INTERVALS[quality];
  if (!intervals) {
    throw new Error(`Unknown quality "${quality}"`);
  }

  // Number of chord tones = intervals.length + 1.
  const N = intervals.length + 1;

  // Letter names are determined by scale degrees: root, root+2, root+4, ...
  const letters: string[] = [];
  for (let i = 0; i < N; i++) {
    const deg = ((root - 1) + 2 * i) % 7 + 1;
    letters.push(scaleDegreeLetter(key, deg));
  }

  // Compute the root's actual semitone (above C in the key's reference).
  const rootDiatonic = diatonicSemitone(key, root);
  const rootSemi = rootDiatonic + accidentalDelta(accidental);

  // Build absolute semitones for each chord tone using the quality intervals.
  const absSemis: number[] = [rootSemi];
  for (let i = 0; i < intervals.length; i++) {
    const prev = absSemis[i];
    const interval = intervals[i];
    if (prev === undefined || interval === undefined) {
      throw new Error('Internal error: interval pattern out of bounds');
    }
    absSemis.push(prev + interval);
  }

  // For each chord tone, derive accidental: required delta = absoluteSemi - naturalSemi
  // where naturalSemi is the natural pitch of that letter (in an appropriate octave).
  // Octave wraps when letter pitch-class order regresses.
  const notes: Note[] = [];
  let octave = 0;
  let prevLetterIdx = -1;
  for (let i = 0; i < N; i++) {
    const letter = letters[i];
    if (letter === undefined) {
      throw new Error('Internal error: letter index out of bounds');
    }
    const letterIdx = LETTER_INDEX[letter];
    if (letterIdx === undefined) {
      throw new Error(`Unknown letter "${letter}"`);
    }
    if (i > 0 && letterIdx <= prevLetterIdx) {
      octave += 1;
    }
    prevLetterIdx = letterIdx;

    // What is the natural pitch of this letter at this octave, relative to root's C?
    const naturalSemi = LETTER_SEMITONE[letter];
    if (naturalSemi === undefined) {
      throw new Error(`Unknown letter "${letter}"`);
    }
    // We need an absolute semitone reference. Since the root is at octave 0,
    // root letter's natural pitch in our local numbering is LETTER_SEMITONE[rootLetter],
    // and the root note has absolute semi value = rootSemi. Any other note's
    // natural-in-octave-K semitone is naturalSemi + 12*octave.
    // But we built absSemis treating intervals as straight additions in semitones,
    // which already accounts for octave when the interval crosses a "C boundary"
    // numerically. Letter-based octave wrap should agree with semitone-based.
    //
    // Compute expected octave from semitone:
    const absSemi = absSemis[i];
    if (absSemi === undefined) {
      throw new Error('Internal error: absolute semitone out of bounds');
    }
    // The accidental we draw = absSemi - (naturalSemi + 12*octave)
    const delta = absSemi - (naturalSemi + 12 * octave);
    notes.push({
      letter,
      accidental: deltaToDrawnAccidental(delta, letter, key),
      octave,
    });
  }

  return notes;
}

/**
 * Render a Note as "C0", "G♯1", "B♭♭2" etc. for human-readable output.
 * Used in tests and debug output.
 */
export function noteToString(note: Note): string {
  let acc = '';
  switch (note.accidental) {
    case 'double-flat':
      acc = '𝄫';
      break;
    case 'flat':
      acc = '♭';
      break;
    case 'natural':
      acc = '♮';
      break;
    case 'sharp':
      acc = '♯';
      break;
    case 'double-sharp':
      acc = '𝄪';
      break;
    default:
      acc = '';
  }
  return `${note.letter}${acc}${note.octave}`;
}

/** Same, but returning ASCII (e.g. "Gb1", "C#0") for use in IDs. */
export function noteToAscii(note: Note): string {
  let acc = '';
  switch (note.accidental) {
    case 'double-flat':
      acc = 'bb';
      break;
    case 'flat':
      acc = 'b';
      break;
    case 'natural':
      acc = '';
      break;
    case 'sharp':
      acc = '#';
      break;
    case 'double-sharp':
      acc = '##';
      break;
    default:
      acc = '';
  }
  return `${note.letter}${acc}${note.octave}`;
}
