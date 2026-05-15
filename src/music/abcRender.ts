import type { Exercise, Note, KeySignature } from './types';

/**
 * Convert a Note's drawn accidental to ABC notation prefix.
 *   double-flat  __
 *   flat         _
 *   natural      =
 *   sharp        ^
 *   double-sharp ^^
 *   null         (none)
 */
function abcAccidental(note: Note): string {
  switch (note.accidental) {
    case 'double-flat': return '__';
    case 'flat': return '_';
    case 'natural': return '=';
    case 'sharp': return '^';
    case 'double-sharp': return '^^';
    default: return '';
  }
}

/**
 * Map a Note (octave 0+ relative) plus absolute reference to ABC pitch token.
 *
 * In ABC, "C" = middle-octave C (treble line below middle line = C5? Actually
 * ABC's default treble octave starts at C4 for "C"). To keep things explicit,
 * we use:
 *   C, D, E, F, G, A, B   => MIDI C4..B4
 *   C ' suffix raises octave: C' = C5, C'' = C6
 *   C , suffix lowers octave: C, = C3, C,, = C2
 *
 * Wait — ABC convention is actually:
 *   "C" = C4, "c" = C5
 *   Each ' raises, each , lowers.
 *
 * We'll use uppercase letters with octave modifiers.
 */
function abcPitch(note: Note, absoluteOctave: number): string {
  // absoluteOctave is the desired absolute octave (e.g., 4 = middle octave).
  // ABC: bare uppercase letter = octave 4. Lowercase = octave 5.
  // Each ' raises by an octave from the bare letter; each , lowers.
  //
  // We'll always use uppercase letters and adjust with ' or , markers.
  const letter = note.letter.toUpperCase();
  const acc = abcAccidental(note);

  let suffix = '';
  if (absoluteOctave === 4) {
    // bare uppercase
  } else if (absoluteOctave === 5) {
    suffix = "'";
  } else if (absoluteOctave === 6) {
    suffix = "''";
  } else if (absoluteOctave === 7) {
    suffix = "'''";
  } else if (absoluteOctave === 3) {
    suffix = ',';
  } else if (absoluteOctave === 2) {
    suffix = ',,';
  } else if (absoluteOctave === 1) {
    suffix = ',,,';
  } else if (absoluteOctave === 0) {
    suffix = ',,,,';
  } else if (absoluteOctave > 7) {
    suffix = "'".repeat(absoluteOctave - 4);
  } else {
    suffix = ','.repeat(4 - absoluteOctave);
  }
  return `${acc}${letter}${suffix}`;
}

/** ABC key signature label, e.g. "Eb", "F#m"... */
function abcKey(key: KeySignature): string {
  // We always use major for the abc key spec since the staff display only
  // depends on the key signature accidentals (which are the same for major
  // and its relative minor). Use major tonic letter + accidental.
  // key.majorTonic is like "C♭", "E♭", "F♯", "C".
  const tonic = key.majorTonic.replace('♭', 'b').replace('♯', '#');
  return tonic;
}

/**
 * Build the ABC notation string for a staff exercise. Whole-note chords on
 * the chosen clef placement(s), with key signature, no time signature, no
 * bar lines (we wrap to avoid bar engraving by using a length-1 measure).
 */
export function exerciseToAbc(exercise: Exercise): string {
  if (exercise.exerciseType !== 'staff') {
    throw new Error('exerciseToAbc only handles staff exercises');
  }
  const key = exercise.keySignature;
  const keyStr = abcKey(key);

  // ABC convention: voice declarations and %%score directive go before K:.
  // L:1 means whole note. M:none suppresses time signature.
  const header =
    `X:1\n` +
    `L:1\n` +
    `M:none\n` +
    `%%score {T | B}\n` +
    `V:T clef=treble\n` +
    `V:B clef=bass\n` +
    `K:${keyStr}\n`;

  // Whole-note rest in ABC notation: "z" with our L:1 it's a whole rest.
  const rest = 'z';

  const clef = exercise.clef;

  let trebleContent: string;
  let bassContent: string;

  if (clef === 'both') {
    const treble = exercise.trebleNotes ?? [];
    const bass = exercise.bassNotes ?? [];
    trebleContent = chordToAbc(treble);
    bassContent = chordToAbc(bass);
  } else if (clef === 'treble') {
    trebleContent = chordToAbc(exercise.notes);
    bassContent = rest;
  } else {
    trebleContent = rest;
    bassContent = chordToAbc(exercise.notes);
  }

  return (
    `${header}` +
    `[V:T]${trebleContent}|\n` +
    `[V:B]${bassContent}|\n`
  );
}

function chordToAbc(notes: Note[]): string {
  if (notes.length === 0) return 'x';
  if (notes.length === 1) {
    const note = notes[0];
    if (!note) return 'x';
    return abcPitch(note, note.octave);
  }
  const sorted = [...notes].sort((a, b) => {
    if (a.octave !== b.octave) return a.octave - b.octave;
    const LETTER_INDEX: Record<string, number> = {
      C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
    };
    return (LETTER_INDEX[a.letter] ?? 0) - (LETTER_INDEX[b.letter] ?? 0);
  });
  const tokens = sorted.map((n) => abcPitch(n, n.octave));
  return `[${tokens.join('')}]`;
}
