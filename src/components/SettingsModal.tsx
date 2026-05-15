import { useState, useEffect, useRef } from 'react';
import type { Settings } from '../state/settings';
import { KEY_SIGNATURES } from '../music/types';
import type { Clef, ExerciseType, FigureType, NumeralSystem } from '../music/types';

interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}

interface ValidationErrors {
  keySignatures?: string;
  exerciseTypes?: string;
  staffFigures?: string;
  staffClefs?: string;
  leadFigures?: string;
}

type ErrorKey = keyof ValidationErrors;

/** Order of fields top-to-bottom; used to pick the first error to scroll to. */
const FIELD_ORDER: ErrorKey[] = [
  'keySignatures',
  'exerciseTypes',
  'staffFigures',
  'staffClefs',
  'leadFigures',
];

/**
 * Returns whether the "both" clef option is allowed by the current draft.
 * The both-clef placement only makes sense when chord-shaped figures (triad
 * or 7th) are in the staff-figures set. This is the single source of truth
 * used for both the disabled state of the checkbox and the auto-clear effect.
 */
function isBothClefAllowed(draft: Settings): boolean {
  return draft.staffFigures.includes('triad') || draft.staffFigures.includes('7th');
}

function validate(draft: Settings): ValidationErrors {
  const errors: ValidationErrors = {};
  if (draft.keySignatureIds.length === 0) {
    errors.keySignatures = 'Select at least one key signature.';
  }
  if (draft.exerciseTypes.length === 0) {
    errors.exerciseTypes = 'Select at least one exercise type.';
  }
  // The following only apply when the dependent exercise type is enabled.
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

export function SettingsModal({ open, settings, onClose, onSave }: SettingsModalProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const rowRefs = useRef<Record<ErrorKey, HTMLDivElement | null>>({
    keySignatures: null,
    exerciseTypes: null,
    staffFigures: null,
    staffClefs: null,
    leadFigures: null,
  });

  useEffect(() => {
    setDraft(settings);
  }, [settings, open]);

  const bothClefAllowed = isBothClefAllowed(draft);

  // Auto-clear "both" from staffClefs if it's no longer allowed (e.g., user
  // unchecked both "triad" and "7th"). Must run unconditionally before any
  // early return to keep hook order stable.
  useEffect(() => {
    if (!bothClefAllowed && draft.staffClefs.includes('both')) {
      setDraft((d) => ({ ...d, staffClefs: d.staffClefs.filter((c) => c !== 'both') }));
    }
  }, [bothClefAllowed, draft.staffClefs]);

  if (!open) return null;

  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;

  const handleClose = () => {
    if (hasErrors) {
      // Scroll to the first error in document order.
      for (const key of FIELD_ORDER) {
        if (errors[key]) {
          const node = rowRefs.current[key];
          if (node) {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          break;
        }
      }
      return;
    }
    onSave(draft);
    onClose();
  };

  const setRowRef = (key: ErrorKey) => (node: HTMLDivElement | null) => {
    rowRefs.current[key] = node;
  };

  const rowClass = (key: ErrorKey) =>
    `form-row${errors[key] ? ' has-error' : ''}`;

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { handleClose(); } }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleClose} aria-label="Close settings">×</button>
        </div>
        <div className="modal-body">

          <div ref={setRowRef('keySignatures')} className={rowClass('keySignatures')}>
            <label>Key signatures</label>
            <div className="multi-list-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() =>
                  setDraft({ ...draft, keySignatureIds: KEY_SIGNATURES.map((k) => k.id) })
                }
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setDraft({ ...draft, keySignatureIds: [] })}
              >
                Clear all
              </button>
            </div>
            <div className="multi-list">
              {KEY_SIGNATURES.map((k) => (
                <label key={k.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.keySignatureIds.includes(k.id)}
                    onChange={() => setDraft({ ...draft, keySignatureIds: toggle(draft.keySignatureIds, k.id) })}
                  />
                  <span>{k.majorTonic} Major / {k.minorTonic} Minor</span>
                </label>
              ))}
            </div>
            {errors.keySignatures && (
              <div className="form-error" role="alert">{errors.keySignatures}</div>
            )}
          </div>

          <div ref={setRowRef('exerciseTypes')} className={rowClass('exerciseTypes')}>
            <label>Exercise types</label>
            <div className="multi-list">
              {(['staff', 'leadsheet'] as ExerciseType[]).map((t) => (
                <label key={t} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.exerciseTypes.includes(t)}
                    onChange={() => setDraft({ ...draft, exerciseTypes: toggle(draft.exerciseTypes, t) })}
                  />
                  <span>{t === 'staff' ? 'Staff sight reading' : 'Lead sheet reading'}</span>
                </label>
              ))}
            </div>
            {errors.exerciseTypes && (
              <div className="form-error" role="alert">{errors.exerciseTypes}</div>
            )}
          </div>

          <div ref={setRowRef('staffFigures')} className={rowClass('staffFigures')}>
            <label className={!draft.exerciseTypes.includes('staff') ? 'disabled' : ''}>
              Staff sight reading figures
            </label>
            <div className="multi-list">
              {(['note', 'interval', 'triad', '7th'] as FigureType[]).map((f) => (
                <label key={f} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.staffFigures.includes(f)}
                    disabled={!draft.exerciseTypes.includes('staff')}
                    onChange={() => setDraft({ ...draft, staffFigures: toggle(draft.staffFigures, f) })}
                  />
                  <span>{f}</span>
                </label>
              ))}
            </div>
            {errors.staffFigures && (
              <div className="form-error" role="alert">{errors.staffFigures}</div>
            )}
          </div>

          <div ref={setRowRef('staffClefs')} className={rowClass('staffClefs')}>
            <label className={!draft.exerciseTypes.includes('staff') ? 'disabled' : ''}>
              Staff sight reading clefs
            </label>
            <div className="multi-list">
              {(['treble', 'bass', 'both'] as Clef[]).map((c) => (
                <label key={c} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.staffClefs.includes(c)}
                    disabled={
                      !draft.exerciseTypes.includes('staff') ||
                      (c === 'both' && !bothClefAllowed)
                    }
                    onChange={() => setDraft({ ...draft, staffClefs: toggle(draft.staffClefs, c) })}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <div className={`help${!draft.exerciseTypes.includes('staff') ? ' disabled' : ''}`}>
              "both" requires triad or 7th.
            </div>
            {errors.staffClefs && (
              <div className="form-error" role="alert">{errors.staffClefs}</div>
            )}
          </div>

          <div ref={setRowRef('leadFigures')} className={rowClass('leadFigures')}>
            <label className={!draft.exerciseTypes.includes('leadsheet') ? 'disabled' : ''}>
              Lead sheet reading figures
            </label>
            <div className="multi-list">
              {(['triad', '7th'] as FigureType[]).map((f) => (
                <label key={f} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.leadFigures.includes(f)}
                    disabled={!draft.exerciseTypes.includes('leadsheet')}
                    onChange={() => setDraft({ ...draft, leadFigures: toggle(draft.leadFigures, f) })}
                  />
                  <span>{f}</span>
                </label>
              ))}
            </div>
            {errors.leadFigures && (
              <div className="form-error" role="alert">{errors.leadFigures}</div>
            )}
          </div>

          <div className="form-row">
            <label htmlFor="numeral-system">Numeral system</label>
            <select
              id="numeral-system"
              value={draft.numeralSystem}
              onChange={(e) => setDraft({ ...draft, numeralSystem: e.target.value as NumeralSystem })}
            >
              <option value="scale-relative">Scale-relative</option>
              <option value="major-referential">Major-referential</option>
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="set-length">Set length</label>
            <input
              id="set-length"
              type="number"
              min={1}
              value={draft.setLength}
              onChange={(e) => setDraft({ ...draft, setLength: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>

          <div className="form-row">
            <label htmlFor="prompt-duration">Prompt duration (seconds)</label>
            <input
              id="prompt-duration"
              type="number"
              min={1}
              step={0.1}
              value={draft.promptDuration ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({ ...draft, promptDuration: v === '' ? undefined : Math.max(1, parseFloat(v)) });
              }}
            />
            <div className="help">Leave empty for indefinite (advance only on Next). Minimum 1.</div>
          </div>

          <div className="form-row">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.showReveal}
                onChange={(e) => setDraft({ ...draft, showReveal: e.target.checked })}
              />
              <span>Show reveal phase</span>
            </label>
            <div className="help">If unchecked, exercises skip directly to the next prompt without showing the answer.</div>
          </div>

          <div className="form-row">
            <label
              htmlFor="reveal-duration"
              className={!draft.showReveal ? 'disabled' : ''}
            >
              Reveal duration (seconds)
            </label>
            <input
              id="reveal-duration"
              type="number"
              min={1}
              step={0.1}
              disabled={!draft.showReveal}
              value={draft.revealDuration ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({ ...draft, revealDuration: v === '' ? undefined : Math.max(1, parseFloat(v)) });
              }}
            />
            <div className={`help${!draft.showReveal ? ' disabled' : ''}`}>
              Leave empty for indefinite (advance only on Next). Minimum 1. Ignored when "Show reveal phase" is off.
            </div>
          </div>

        </div>
        <div className="footer-actions">
          <button className="btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
