import type { ExerciseType, FigureType, NumeralSystem, Clef } from '../music/types';
import { isSettingsValid } from './validation';

export interface Settings {
  keySignatureIds: string[];
  exerciseTypes: ExerciseType[];
  staffFigures: FigureType[];
  staffClefs: Clef[];
  leadFigures: FigureType[];
  numeralSystem: NumeralSystem;
  setLength: number;
  /** Whether the reveal phase is shown. If false, exercises skip from prompt directly to the next prompt. */
  showReveal: boolean;
  /**
   * Whether lead-sheet exercises include the chord's root pitch as a bass note
   * in the reveal-phase playback (a perfect-fifth or more below the chord's
   * lowest note). Helps the user hear chord function.
   */
  playLeadSheetRoot: boolean;
  /** seconds; undefined => indefinite (manual advance only) */
  promptDuration: number | undefined;
  revealDuration: number | undefined;
  /**
   * Whether the app plays audio in response to external MIDI keyboard input.
   * When false, external-MIDI note-ons still update the active-note state and
   * the piano-roll blue highlight, but the audio sampler is triggered at
   * velocity 0 — silent. Useful when the external keyboard already produces
   * its own audio. Does not affect mouse, touch, or reveal-phase playback.
   */
  playExternalMidi: boolean;
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
  showReveal: true,
  playLeadSheetRoot: true,
  promptDuration: 5,
  revealDuration: 3,
  playExternalMidi: true,
};

const STORAGE_KEY = 'chord-reading-trainer:settings';

/**
 * Load settings from localStorage. If anything is wrong — missing entry, bad
 * JSON, wrong shape, or content-invalid — clears the stored value (when
 * present) and returns defaults.
 */
export function loadSettings(): Settings {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (raw === null) return DEFAULT_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSettingsValid(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to clear + defaults
  }
  clearSettings();
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
