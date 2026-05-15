import type { ChordPoolEntry, FigureType } from './types';

/**
 * The chord pool per §3.2.4. Same pool serves both major and minor display
 * modes; only the rendered numeral text differs.
 */
export const TRIAD_POOL: ChordPoolEntry[] = [
  // Diatonic in major mode
  { root: 1, accidental: null, quality: 'major' },
  { root: 2, accidental: null, quality: 'minor' },
  { root: 3, accidental: null, quality: 'minor' },
  { root: 4, accidental: null, quality: 'major' },
  { root: 5, accidental: null, quality: 'major' },
  { root: 6, accidental: null, quality: 'minor' },
  { root: 7, accidental: null, quality: 'diminished' },
  // Additional
  { root: 3, accidental: null, quality: 'major' },
  { root: 7, accidental: null, quality: 'major' },
  { root: 2, accidental: null, quality: 'major' },
  { root: 4, accidental: null, quality: 'minor' },
  { root: 1, accidental: null, quality: 'augmented' },
];

export const SEVENTH_POOL: ChordPoolEntry[] = [
  // Diatonic in major mode
  { root: 1, accidental: null, quality: 'major-7th' },
  { root: 2, accidental: null, quality: 'minor-7th' },
  { root: 3, accidental: null, quality: 'minor-7th' },
  { root: 4, accidental: null, quality: 'major-7th' },
  { root: 5, accidental: null, quality: 'dominant-7th' },
  { root: 6, accidental: null, quality: 'minor-7th' },
  { root: 7, accidental: null, quality: 'half-diminished-7th' },
  // Additional
  { root: 3, accidental: null, quality: 'dominant-7th' },
  { root: 7, accidental: null, quality: 'dominant-7th' },
  { root: 2, accidental: null, quality: 'dominant-7th' },
  { root: 6, accidental: null, quality: 'minor-major-7th' },
  { root: 1, accidental: null, quality: 'augmented-major-7th' },
  { root: 4, accidental: null, quality: 'minor-major-7th' },
];

export function getPoolForFigure(figure: FigureType): ChordPoolEntry[] {
  return figure === 'triad' ? TRIAD_POOL : SEVENTH_POOL;
}
