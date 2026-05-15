import type { Note } from './types';
import { applyInversion } from './inversion';
import {
  pickOctaveShift,
  shiftOctaves,
  TREBLE_RANGE,
  BASS_RANGE,
} from './placement';
import { noteLetterIndex } from './midi';

export interface BothClefResult {
  treble: Note[];
  bass: Note[];
}

/**
 * Split a chord across two clefs per §3.3.3.
 * - bass selection: remove j in [1,N] random notes; those are the bass chord
 * - treble selection: union of "not assigned to bass" (size N-j) with k in [1,N] random from full chord
 * - inversion: independent per clef
 * - 50% chance: double the lowest bass note up an octave
 * - octave placement: independent per clef
 * - non-overlap: bass's highest sounding pitch < treble's lowest
 * The function retries the full process up to a maximum until the non-overlap
 * constraint is satisfied.
 */
export function splitAcrossClefs(
  fullChord: Note[],
  rng: () => number,
  maxAttempts: number = 64,
): BothClefResult {
  const N = fullChord.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Bass selection: pick j unique indices, then sort ascending so the chord
    // tones stay in their original (stacked-third) order. The randomness is
    // only over *which* notes get assigned to the bass, not their order.
    const j = 1 + Math.floor(rng() * N); // 1..N
    const bassIdxs = pickRandomIndices(N, j, rng).sort((a, b) => a - b);
    const bassNotesBase: Note[] = bassIdxs
      .map((i) => fullChord[i])
      .filter((n): n is Note => n !== undefined);
    const remainingIdxs = [...Array(N).keys()].filter((i) => !bassIdxs.includes(i));

    // Treble selection: union of R with k random picks
    const k = 1 + Math.floor(rng() * N); // 1..N
    const trebleRandomIdxs = pickRandomIndices(N, k, rng);
    const trebleIdxSet = new Set<number>([...remainingIdxs, ...trebleRandomIdxs]);
    const trebleNotesBase: Note[] = [...trebleIdxSet]
      .sort((a, b) => a - b)
      .map((i) => fullChord[i])
      .filter((n): n is Note => n !== undefined);

    if (trebleNotesBase.length === 0 || bassNotesBase.length === 0) continue;

    // Re-normalize each clef chord so the first note starts at octave 0.
    const normalize = (chord: Note[]): Note[] => {
      const firstOctave = chord[0]?.octave ?? 0;
      if (firstOctave === 0) return chord.map((n) => ({ ...n }));
      return chord.map((n) => ({ ...n, octave: n.octave - firstOctave }));
    };
    const bassNormalized = normalize(bassNotesBase);
    const trebleNormalized = normalize(trebleNotesBase);

    // Independent inversions
    const bassInv = Math.floor(rng() * bassNormalized.length);
    const trebleInv = Math.floor(rng() * trebleNormalized.length);
    let bassInverted = applyInversion(bassNormalized, bassInv);
    const trebleInverted = applyInversion(trebleNormalized, trebleInv);

    // 50% chance: double lowest bass note up an octave
    if (rng() < 0.5 && bassInverted.length > 0) {
      const lowest = bassInverted[0];
      if (lowest !== undefined) {
        bassInverted = [
          ...bassInverted,
          { ...lowest, octave: lowest.octave + 1 },
        ];
      }
    }

    // Independent octave placement
    const bassShift = pickOctaveShift(bassInverted, BASS_RANGE, rng);
    const trebleShift = pickOctaveShift(trebleInverted, TREBLE_RANGE, rng);

    const bassFinal = shiftOctaves(bassInverted, bassShift);
    const trebleFinal = shiftOctaves(trebleInverted, trebleShift);

    // Non-overlap check
    const bassMax = Math.max(...bassFinal.map((n) => noteLetterIndex(n, 0)));
    const trebleMin = Math.min(...trebleFinal.map((n) => noteLetterIndex(n, 0)));

    if (bassMax < trebleMin) {
      return { treble: trebleFinal, bass: bassFinal };
    }
  }

  // Fallback: deterministic safe placement.
  const bassFinal = shiftOctaves(fullChord, -1);
  const trebleFinal = shiftOctaves(fullChord, 2);
  return { treble: trebleFinal, bass: bassFinal };
}

function pickRandomIndices(n: number, count: number, rng: () => number): number[] {
  const all = [...Array(n).keys()];
  // Fisher-Yates partial shuffle
  for (let i = 0; i < count && i < all.length; i++) {
    const j = i + Math.floor(rng() * (all.length - i));
    const ai = all[i];
    const aj = all[j];
    if (ai === undefined || aj === undefined) continue;
    all[i] = aj;
    all[j] = ai;
  }
  return all.slice(0, count);
}
