import type {
  ChordPoolEntry,
  DisplayMode,
  KeySignature,
  NumeralSystem,
  Quality,
} from './types';

const UPPER_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const LOWER_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'] as const;

/**
 * Returns whether the quality renders with an uppercase or lowercase numeral.
 */
function numeralCase(quality: Quality): 'upper' | 'lower' {
  switch (quality) {
    case 'major':
    case 'major-7th':
    case 'dominant-7th':
    case 'augmented':
    case 'augmented-major-7th':
      return 'upper';
    case 'minor':
    case 'minor-7th':
    case 'minor-major-7th':
    case 'diminished':
    case 'diminished-7th':
    case 'half-diminished-7th':
      return 'lower';
  }
}

function qualitySuffix(quality: Quality, isSeventh: boolean): string {
  // Quality symbol that follows the numeral but before figured bass.
  switch (quality) {
    case 'augmented':
    case 'augmented-major-7th':
      return '+';
    case 'diminished':
    case 'diminished-7th':
      return '°';
    case 'half-diminished-7th':
      return 'ø';
    default:
      return '';
  }
  // Note: isSeventh is informational; figured-bass numerals carry the "7".
  void isSeventh;
}

/**
 * Figured bass for inversion.
 * For triads: root pos = "", 1st inv = "6", 2nd inv = "6/4".
 * For 7ths: root pos = "7", 1st inv = "6/5", 2nd inv = "4/3", 3rd inv = "4/2".
 */
function figuredBass(inversion: number, isSeventh: boolean): string {
  if (!isSeventh) {
    switch (inversion) {
      case 0:
        return '';
      case 1:
        return '⁶';
      case 2:
        return '⁶⁄₄';
      default:
        return '';
    }
  } else {
    switch (inversion) {
      case 0:
        return '⁷';
      case 1:
        return '⁶⁄₅';
      case 2:
        return '⁴⁄₃';
      case 3:
        return '⁴⁄₂';
      default:
        return '⁷';
    }
  }
}

function isSeventhQuality(q: Quality): boolean {
  return (
    q === 'major-7th' ||
    q === 'minor-7th' ||
    q === 'dominant-7th' ||
    q === 'diminished-7th' ||
    q === 'half-diminished-7th' ||
    q === 'minor-major-7th' ||
    q === 'augmented-major-7th'
  );
}

/**
 * Render a numeral (no accidental prefix). The numeral case follows the
 * chord quality, not the scale degree.
 */
function baseNumeral(scaleDegree: number, quality: Quality): string {
  const idx = scaleDegree - 1;
  return numeralCase(quality) === 'upper'
    ? (UPPER_NUMERALS[idx] ?? '?')
    : (LOWER_NUMERALS[idx] ?? '?');
}

/**
 * For major-referential mode, determine whether the displayed scale degree
 * needs a ♭ or ♯ prefix relative to the displayed tonic's major scale.
 *
 * Strategy: compute the semitone interval from the displayed tonic up to
 * the chord root, and compare against what that scale degree would be in
 * a major scale.
 */
function majorReferentialAccidental(
  key: KeySignature,
  displayedMode: DisplayMode,
  chordRoot: number, // 1..7, scale degree of the major reference
  chordAccidental: 'flat' | null | 'sharp',
): string {
  if (displayedMode === 'major') {
    // Displayed tonic = major-reference tonic. No accidental needed if chord
    // root has no accidental in the major reference. Otherwise prepend.
    if (chordAccidental === 'flat') return '♭';
    if (chordAccidental === 'sharp') return '♯';
    return '';
  }
  // Minor display: displayed tonic = relative minor (scale degree 6 of major ref).
  // Map chordRoot (1..7 of major ref) to scale degree relative to minor tonic.
  // The minor tonic (in scale-relative) is scale degree 6 of the major ref.
  //
  // Compute the semitone offset of the chord root from the minor tonic,
  // and compare with the major scale built on the minor tonic.
  //
  // Easier: use the fact that minor tonic letter is 5 semitones below major tonic
  // (major-ref scale degree 6 = minor relative). Let's compute via letter mapping:
  // - majorRef scale degrees 1..7 = C major's C D E F G A B (relative letter ordering).
  // - relative minor tonic = degree 6 of major-ref.
  // - degree N of major-ref maps to (N - 6 + 7) mod 7 + 1 of minor-ref scale-degree
  //   where the minor-ref interprets that as degrees of its own major mode.
  // Then compare the actual diatonic semitone offset (under the natural minor key
  // signature) to what the major scale built on the minor tonic would give.

  // Number of semitones from major-ref tonic to the chord's root:
  // Scale degrees in major mode (semitones above tonic): 0, 2, 4, 5, 7, 9, 11
  const MAJOR_DEGREE_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const rootSemiFromMajorTonic =
    (MAJOR_DEGREE_SEMI[chordRoot - 1] ?? 0) +
    (chordAccidental === 'flat' ? -1 : chordAccidental === 'sharp' ? 1 : 0);

  // Minor tonic is at semitone 9 above major tonic.
  const MINOR_TONIC_SEMI = 9;
  let rootSemiFromMinorTonic = rootSemiFromMajorTonic - MINOR_TONIC_SEMI;
  while (rootSemiFromMinorTonic < 0) rootSemiFromMinorTonic += 12;
  rootSemiFromMinorTonic %= 12;

  // Determine the scale degree (1..7) of the minor tonic's major scale this
  // pitch corresponds to. Use letter mapping for consistency, but we just
  // need the closest scale-degree slot.
  //
  // Map chordRoot (major-ref) to letter-step position relative to minor tonic.
  // Major-ref degree 6 is the minor tonic letter; major-ref degree N is at
  // letter position ((N-1) - (6-1) + 7) mod 7 = (N - 6 + 7) mod 7 = (N + 1) mod 7.
  const minorRefDegreeIdx = ((chordRoot - 6 + 7) % 7); // 0..6
  const minorRefScaleDegree = minorRefDegreeIdx + 1;

  // Expected semitone if this were the major scale on the minor tonic:
  const expected = MAJOR_DEGREE_SEMI[minorRefDegreeIdx] ?? 0;
  const delta = rootSemiFromMinorTonic - expected;
  void minorRefScaleDegree; // unused

  // Suppress unused-key warning by referencing key
  void key;

  if (delta === -1) return '♭';
  if (delta === -2) return '♭♭';
  if (delta === 1) return '♯';
  if (delta === 2) return '♯♯';
  return '';
}

/**
 * Compute the displayed scale degree (1-7) of a chord in scale-relative mode.
 * In major display mode, chord's root degree (in major reference) is the same.
 * In minor display mode, we rotate so that the relative minor tonic becomes
 * degree 1 (which corresponds to major-ref degree 6).
 */
function scaleRelativeDegree(chordRoot: number, mode: DisplayMode): number {
  if (mode === 'major') return chordRoot;
  // Minor: minor tonic = major-ref degree 6.
  // Major-ref degree N -> minor scale-relative degree ((N - 6 + 7) mod 7) + 1
  return ((chordRoot - 6 + 7) % 7) + 1;
}

/**
 * For scale-relative minor, accidentals show up when the chord pitch differs
 * from the natural minor's diatonic pitch on that degree.
 *
 * Natural minor scale degrees (semitones above tonic): 0, 2, 3, 5, 7, 8, 10.
 */
function scaleRelativeMinorAccidental(
  chordRoot: number,
  chordAccidental: 'flat' | null | 'sharp',
): string {
  const MAJOR_DEGREE_SEMI = [0, 2, 4, 5, 7, 9, 11];
  const NATURAL_MINOR_SEMI = [0, 2, 3, 5, 7, 8, 10];

  const rootSemiFromMajorTonic =
    (MAJOR_DEGREE_SEMI[chordRoot - 1] ?? 0) +
    (chordAccidental === 'flat' ? -1 : chordAccidental === 'sharp' ? 1 : 0);

  const MINOR_TONIC_SEMI = 9;
  let rootSemiFromMinorTonic = rootSemiFromMajorTonic - MINOR_TONIC_SEMI;
  while (rootSemiFromMinorTonic < 0) rootSemiFromMinorTonic += 12;
  rootSemiFromMinorTonic %= 12;

  const minorDegreeIdx = (chordRoot - 6 + 7) % 7;
  const expected = NATURAL_MINOR_SEMI[minorDegreeIdx] ?? 0;
  const delta = rootSemiFromMinorTonic - expected;

  if (delta === -1) return '♭';
  if (delta === -2) return '♭♭';
  if (delta === 1) return '♯';
  if (delta === 2) return '♯♯';
  return '';
}

/**
 * Render a chord pool entry as a Roman-numeral string.
 */
export function renderNumeral(
  key: KeySignature,
  entry: ChordPoolEntry,
  inversion: number,
  mode: DisplayMode,
  system: NumeralSystem,
): string {
  const seventh = isSeventhQuality(entry.quality);

  if (system === 'scale-relative') {
    const degree = scaleRelativeDegree(entry.root, mode);
    const prefix =
      mode === 'major'
        ? // In major display mode, scale-relative numerals show no accidental
          // for diatonic chords. Apply chord's accidental directly if any.
          entry.accidental === 'flat'
          ? '♭'
          : entry.accidental === 'sharp'
            ? '♯'
            : ''
        : scaleRelativeMinorAccidental(entry.root, entry.accidental);
    const numeral = baseNumeral(degree, entry.quality);
    const suffix = qualitySuffix(entry.quality, seventh);
    const fb = figuredBass(inversion, seventh);
    return `${prefix}${numeral}${suffix}${fb}`;
  } else {
    // major-referential
    const degree = entry.root;
    const prefix = majorReferentialAccidental(key, mode, entry.root, entry.accidental);
    const numeral = baseNumeral(degree, entry.quality);
    const suffix = qualitySuffix(entry.quality, seventh);
    const fb = figuredBass(inversion, seventh);
    return `${prefix}${numeral}${suffix}${fb}`;
  }
}

/** Display text for the key name in lead sheet mode. */
export function keyDisplayName(key: KeySignature, mode: DisplayMode): string {
  return mode === 'major' ? `${key.majorTonic} major` : `${key.minorTonic} minor`;
}
