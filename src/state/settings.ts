import type { ExerciseType, FigureType, NumeralSystem, Clef } from '../music/types';

export interface Settings {
  keySignatureIds: string[];
  exerciseTypes: ExerciseType[];
  staffFigures: FigureType[];
  staffClefs: Clef[];
  leadFigures: FigureType[];
  numeralSystem: NumeralSystem;
  setLength: number;
  /** seconds; undefined => indefinite (manual advance only) */
  promptDuration: number | undefined;
  revealDuration: number | undefined;
}

export const DEFAULT_SETTINGS: Settings = {
  keySignatureIds: [
    'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C',
    'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
  ],
  exerciseTypes: ['staff'],
  staffFigures: ['note', 'interval', 'triad', '7th'],
  staffClefs: ['treble', 'bass', 'both'],
  leadFigures: ['triad', '7th'],
  numeralSystem: 'scale-relative',
  setLength: 12,
  promptDuration: 5,
  revealDuration: 3,
};

const STORAGE_KEY = 'chord-reading-trainer:settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
