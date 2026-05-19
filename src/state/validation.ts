import type { Settings } from './settings';
import type { Clef, ExerciseType, FigureType, NumeralSystem } from '../music/types';
import { KEY_SIGNATURES } from '../music/types';

/**
 * Shared validation rules for the settings form.
 *
 * Used in three places:
 *   - SettingsModal renders these as inline error messages.
 *   - SettingsModal blocks "close" if any error is present.
 *   - App startup verifies persisted settings; if invalid, the saved
 *     settings are cleared and the defaults are used.
 */
export interface ValidationErrors {
  keySignatures?: string;
  exerciseTypes?: string;
  staffFigures?: string;
  staffClefs?: string;
  leadFigures?: string;
}

export type ErrorKey = keyof ValidationErrors;

/** Order of fields top-to-bottom; used to pick the first error to scroll to. */
export const FIELD_ORDER: ErrorKey[] = [
  'keySignatures',
  'exerciseTypes',
  'staffFigures',
  'staffClefs',
  'leadFigures',
];

/**
 * Returns whether the "both" clef option is allowed by the current draft.
 * Both-clef placement only makes sense for chord-shaped figures (triad / 7th).
 */
export function isBothClefAllowed(draft: Settings): boolean {
  return draft.staffFigures.includes('triad') || draft.staffFigures.includes('7th');
}

/** Run the content validation; returns an error object (empty if all valid). */
export function validate(draft: Settings): ValidationErrors {
  const errors: ValidationErrors = {};
  if (draft.keySignatureIds.length === 0) {
    errors.keySignatures = 'Select at least one key signature.';
  }
  if (draft.exerciseTypes.length === 0) {
    errors.exerciseTypes = 'Select at least one exercise type.';
  }
  if (draft.exerciseTypes.includes('staff')) {
    if (draft.staffFigures.length === 0) {
      errors.staffFigures = 'Select at least one staff sight reading figure.';
    }
    if (draft.staffClefs.length === 0) {
      errors.staffClefs = 'Select at least one staff sight reading clef.';
    }
  }
  if (draft.exerciseTypes.includes('leadsheet')) {
    if (draft.leadFigures.length === 0) {
      errors.leadFigures = 'Select at least one lead sheet reading figure.';
    }
  }
  return errors;
}

export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Shape check: verify that an arbitrary parsed value matches the Settings
 * schema (all required fields present, all values within their enum/range).
 * Used at app startup to detect corruption or out-of-date persisted data.
 *
 * Stricter than validate() — which assumes a well-shaped Settings object and
 * only checks content invariants like "at least one selected".
 */
export function isSettingsShape(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (!Array.isArray(v.keySignatureIds)) return false;
  const validKeyIds = new Set(KEY_SIGNATURES.map((k) => k.id));
  for (const id of v.keySignatureIds) {
    if (typeof id !== 'string' || !validKeyIds.has(id)) return false;
  }

  if (!Array.isArray(v.exerciseTypes)) return false;
  const validExerciseTypes: ExerciseType[] = ['staff', 'leadsheet'];
  for (const t of v.exerciseTypes) {
    if (typeof t !== 'string' || !validExerciseTypes.includes(t as ExerciseType)) return false;
  }

  if (!Array.isArray(v.staffFigures)) return false;
  const validFigures: FigureType[] = ['note', 'interval', 'triad', '7th'];
  for (const f of v.staffFigures) {
    if (typeof f !== 'string' || !validFigures.includes(f as FigureType)) return false;
  }

  if (!Array.isArray(v.staffClefs)) return false;
  const validClefs: Clef[] = ['treble', 'bass', 'both'];
  for (const c of v.staffClefs) {
    if (typeof c !== 'string' || !validClefs.includes(c as Clef)) return false;
  }

  if (!Array.isArray(v.leadFigures)) return false;
  for (const f of v.leadFigures) {
    if (typeof f !== 'string' || !validFigures.includes(f as FigureType)) return false;
  }

  const validNumeralSystems: NumeralSystem[] = ['scale-relative', 'major-referential'];
  if (typeof v.numeralSystem !== 'string' || !validNumeralSystems.includes(v.numeralSystem as NumeralSystem)) {
    return false;
  }

  if (typeof v.setLength !== 'number' || !Number.isFinite(v.setLength) || v.setLength < 1) return false;

  if (typeof v.showReveal !== 'boolean') return false;

  if (typeof v.playLeadSheetRoot !== 'boolean') return false;

  // promptDuration / revealDuration: undefined or finite >= 1
  for (const key of ['promptDuration', 'revealDuration'] as const) {
    const dur = v[key];
    if (dur !== undefined) {
      if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 1) return false;
    }
  }

  if (typeof v.playExternalMidi !== 'boolean') return false;

  return true;
}

/**
 * Returns true if the parsed settings are both correctly shaped AND content-valid.
 */
export function isSettingsValid(value: unknown): value is Settings {
  if (!isSettingsShape(value)) return false;
  return !hasErrors(validate(value));
}
