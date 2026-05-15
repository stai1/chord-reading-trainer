import type {
  ChordPoolEntry,
  Clef,
  DisplayMode,
  Exercise,
  ExerciseType,
  FigureType,
  KeySignature,
  Note,
} from './types';
import { KEY_SIGNATURES } from './types';
import { TRIAD_POOL, SEVENTH_POOL } from './chordPool';
import { chordToNotes } from './chordToNotes';
import { applyInversion } from './inversion';
import {
  pickOctaveShift,
  shiftOctaves,
  TREBLE_RANGE,
  BASS_RANGE,
} from './placement';
import { splitAcrossClefs } from './bothClef';
import { generateSingleNote } from './singleNote';
import type { Settings } from '../state/settings';

export interface SetSpec {
  keySignature: KeySignature;
  exerciseType: ExerciseType;
  /** Display mode (lead-sheet only). For staff sets this is irrelevant. */
  displayMode: DisplayMode;
}

const defaultRng = () => Math.random();

export function pickKeySignatures(s: Settings): KeySignature[] {
  return KEY_SIGNATURES.filter((k) => s.keySignatureIds.includes(k.id));
}

/**
 * Pick a new set (keySignature, exerciseType) avoiding combos in the buffer.
 */
export function pickNextSet(
  settings: Settings,
  recentBuffer: SetSpec[],
  rng: () => number = defaultRng,
): SetSpec | null {
  const keys = pickKeySignatures(settings);
  const types = settings.exerciseTypes;
  if (keys.length === 0 || types.length === 0) return null;

  // Build all candidate combos. For lead-sheet sets, expand into major and
  // minor display modes so the buffer can distinguish them.
  const all: SetSpec[] = [];
  for (const k of keys) {
    for (const t of types) {
      if (t === 'leadsheet') {
        all.push({ keySignature: k, exerciseType: t, displayMode: 'major' });
        all.push({ keySignature: k, exerciseType: t, displayMode: 'minor' });
      } else {
        all.push({ keySignature: k, exerciseType: t, displayMode: 'major' });
      }
    }
  }

  // Effective buffer length: min(6, totalCombos - 1).
  const maxBuf = Math.max(0, all.length - 1);
  const bufLen = Math.min(6, maxBuf);
  const recentKeys = new Set(
    recentBuffer.slice(-bufLen).map((s) => specKey(s)),
  );

  const candidates = all.filter((c) => !recentKeys.has(specKey(c)));
  const pool = candidates.length > 0 ? candidates : all;
  const idx = Math.floor(rng() * pool.length);
  return pool[idx] ?? null;
}

function specKey(s: SetSpec): string {
  return `${s.keySignature.id}|${s.exerciseType}|${s.displayMode}`;
}

/**
 * Generate one exercise within the current set, avoiding shuffleKey conflicts
 * with the recent within-set buffer.
 */
export function generateExercise(
  set: SetSpec,
  settings: Settings,
  withinSetBuffer: string[],
  rng: () => number = defaultRng,
): Exercise | null {
  const key = set.keySignature;
  if (set.exerciseType === 'staff') {
    return generateStaffExercise(key, settings, withinSetBuffer, rng);
  }
  return generateLeadSheetExercise(key, set.displayMode, settings, withinSetBuffer, rng);
}

function generateStaffExercise(
  key: KeySignature,
  settings: Settings,
  withinSetBuffer: string[],
  rng: () => number,
): Exercise | null {
  const figures = settings.staffFigures;
  if (figures.length === 0) return null;
  const clefs = settings.staffClefs;
  if (clefs.length === 0) return null;

  const recent = new Set(withinSetBuffer.slice(-6));

  // Try up to a number of attempts to find a non-duplicate.
  for (let attempt = 0; attempt < 40; attempt++) {
    const figure = pickRandom(figures, rng);
    if (!figure) continue;

    // Clef selection: "both" only valid for triad/7th. Filter accordingly.
    const validClefs = clefs.filter((c) => {
      if (c === 'both') return figure === 'triad' || figure === '7th';
      return true;
    });
    if (validClefs.length === 0) continue;
    const clef = pickRandom(validClefs, rng);
    if (!clef) continue;

    if (figure === 'note') {
      const exercise = generateNoteExercise(key, clef, rng);
      if (!exercise) continue;
      if (recent.has(exercise.shuffleKey)) continue;
      return exercise;
    } else if (figure === 'interval') {
      const exercise = generateIntervalExercise(key, clef, rng);
      if (!exercise) continue;
      if (recent.has(exercise.shuffleKey)) continue;
      return exercise;
    } else {
      // triad or 7th
      const pool = figure === 'triad' ? TRIAD_POOL : SEVENTH_POOL;
      const entry = pickRandom(pool, rng);
      if (!entry) continue;
      const exercise = buildChordExercise(key, figure, entry, clef, rng);
      if (!exercise) continue;
      if (recent.has(exercise.shuffleKey)) continue;
      return exercise;
    }
  }

  // Fallback without dedupe
  return generateStaffExerciseNoDedupe(key, settings, rng);
}

function generateStaffExerciseNoDedupe(
  key: KeySignature,
  settings: Settings,
  rng: () => number,
): Exercise | null {
  const figure = pickRandom(settings.staffFigures, rng);
  if (!figure) return null;
  const clef = pickRandom(settings.staffClefs, rng);
  if (!clef) return null;
  if (figure === 'note') return generateNoteExercise(key, clef, rng);
  if (figure === 'interval') return generateIntervalExercise(key, clef, rng);
  const pool = figure === 'triad' ? TRIAD_POOL : SEVENTH_POOL;
  const entry = pickRandom(pool, rng);
  if (!entry) return null;
  return buildChordExercise(key, figure, entry, clef, rng);
}

function generateNoteExercise(
  key: KeySignature,
  clef: Clef,
  rng: () => number,
): Exercise | null {
  // Notes don't support "both clef"
  const actualClef: Clef = clef === 'both' ? 'treble' : clef;
  const degree = 1 + Math.floor(rng() * 7);
  const accs: ('flat' | null | 'sharp')[] = ['flat', null, 'sharp'];
  const accidental = accs[Math.floor(rng() * 3)] ?? null;
  const note = generateSingleNote(key, degree, accidental);

  const range = actualClef === 'bass' ? BASS_RANGE : TREBLE_RANGE;
  const shift = pickOctaveShift([note], range, rng);
  const placed = shiftOctaves([note], shift);

  const placedNote = placed[0];
  if (!placedNote) return null;

  return {
    exerciseType: 'staff',
    keySignature: key,
    figureType: 'note',
    displayMode: 'major',
    poolEntry: { root: degree, accidental, quality: 'major' },
    inversion: 0,
    notes: [placedNote],
    clef: actualClef,
    shuffleKey: `note|${degree}|${accidental ?? 'nat'}|${actualClef}`,
  };
}

function generateIntervalExercise(
  key: KeySignature,
  clef: Clef,
  rng: () => number,
): Exercise | null {
  // An interval = pair of diatonic notes (root + one other scale degree).
  // For simplicity here, we pick two distinct scale degrees and treat as
  // a chord with two notes. Use diatonic letters; no chromatic alterations.
  const d1 = 1 + Math.floor(rng() * 7);
  let d2 = 1 + Math.floor(rng() * 7);
  let tries = 0;
  while (d2 === d1 && tries < 10) {
    d2 = 1 + Math.floor(rng() * 7);
    tries++;
  }

  // Build via chordToNotes-like construction: two stacked diatonic notes.
  const noteA = generateSingleNote(key, d1, null);
  const noteB = generateSingleNote(key, d2, null);
  // Order ascending: if d2 < d1 numerically, swap so root is the lower
  const ordered = d2 > d1 ? [noteA, noteB] : [noteB, noteA];
  const lower = ordered[0];
  const upper = ordered[1];
  if (!lower || !upper) return null;

  // Octave: ensure upper letter is above lower letter (otherwise add octave)
  const LETTER_INDEX: Record<string, number> = {
    C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
  };
  const lowerIdx = LETTER_INDEX[lower.letter] ?? 0;
  const upperIdx = LETTER_INDEX[upper.letter] ?? 0;
  let upperOctave = lower.octave;
  if (upperIdx <= lowerIdx) upperOctave += 1;

  const placedNotes: Note[] = [
    { ...lower, octave: 0 },
    { ...upper, octave: upperOctave - lower.octave },
  ];

  // Clef: "both" treated as treble for intervals (simpler; spec only requires "both" for triad/7th)
  const actualClef: Clef = clef === 'both' ? 'treble' : clef;
  const range = actualClef === 'bass' ? BASS_RANGE : TREBLE_RANGE;
  const shift = pickOctaveShift(placedNotes, range, rng);
  const finalNotes = shiftOctaves(placedNotes, shift);

  return {
    exerciseType: 'staff',
    keySignature: key,
    figureType: 'interval',
    displayMode: 'major',
    poolEntry: { root: Math.min(d1, d2), accidental: null, quality: 'major' },
    inversion: 0,
    notes: finalNotes,
    clef: actualClef,
    shuffleKey: `interval|${Math.min(d1, d2)}-${Math.max(d1, d2)}|${actualClef}`,
  };
}

function buildChordExercise(
  key: KeySignature,
  figure: FigureType,
  entry: ChordPoolEntry,
  clef: Clef,
  rng: () => number,
): Exercise | null {
  const chord = chordToNotes(key, entry.root, entry.accidental, entry.quality);
  const inversion = Math.floor(rng() * chord.length);
  const inverted = applyInversion(chord, inversion);

  if (clef === 'both') {
    const split = splitAcrossClefs(inverted, rng);
    return {
      exerciseType: 'staff',
      keySignature: key,
      figureType: figure,
      displayMode: 'major',
      poolEntry: entry,
      inversion,
      notes: [...split.bass, ...split.treble],
      trebleNotes: split.treble,
      bassNotes: split.bass,
      clef: 'both',
      shuffleKey: `${figure}|${entry.root}|${entry.accidental ?? 'nat'}|${entry.quality}|inv${inversion}|both`,
    };
  }

  const range = clef === 'bass' ? BASS_RANGE : TREBLE_RANGE;
  const shift = pickOctaveShift(inverted, range, rng);
  const finalNotes = shiftOctaves(inverted, shift);

  return {
    exerciseType: 'staff',
    keySignature: key,
    figureType: figure,
    displayMode: 'major',
    poolEntry: entry,
    inversion,
    notes: finalNotes,
    clef,
    shuffleKey: `${figure}|${entry.root}|${entry.accidental ?? 'nat'}|${entry.quality}|inv${inversion}|${clef}`,
  };
}

function generateLeadSheetExercise(
  key: KeySignature,
  displayMode: DisplayMode,
  settings: Settings,
  withinSetBuffer: string[],
  rng: () => number,
): Exercise | null {
  const figures = settings.leadFigures;
  if (figures.length === 0) return null;
  const recent = new Set(withinSetBuffer.slice(-6));

  for (let attempt = 0; attempt < 40; attempt++) {
    const figure = pickRandom(figures, rng);
    if (!figure || figure === 'note' || figure === 'interval') continue;
    const pool = figure === 'triad' ? TRIAD_POOL : SEVENTH_POOL;
    const entry = pickRandom(pool, rng);
    if (!entry) continue;
    const inversion = Math.floor(rng() * (figure === 'triad' ? 3 : 4));

    const chord = chordToNotes(key, entry.root, entry.accidental, entry.quality);
    const inverted = applyInversion(chord, inversion);
    const range = TREBLE_RANGE;
    const shift = pickOctaveShift(inverted, range, rng);
    const placedNotes = shiftOctaves(inverted, shift);

    const shuffleKey = `${figure}|${entry.root}|${entry.accidental ?? 'nat'}|${entry.quality}|inv${inversion}`;
    if (recent.has(shuffleKey)) continue;

    return {
      exerciseType: 'leadsheet',
      keySignature: key,
      figureType: figure,
      displayMode,
      poolEntry: entry,
      inversion,
      notes: placedNotes,
      shuffleKey,
    };
  }
  return null;
}

function pickRandom<T>(arr: T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
