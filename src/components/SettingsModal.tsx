import { useState, useEffect, useRef } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import {
  FIELD_ORDER,
  hasErrors as errorsExist,
  isBothClefAllowed,
  validate,
  type ErrorKey,
} from '../state/validation';
import { KEY_SIGNATURES } from '../music/types';
import type { Clef, ExerciseType, FigureType, NumeralSystem } from '../music/types';

interface SettingsModalProps {
  open: boolean;
  /** The current saved settings (used to populate the form and as baseline). */
  settings: Settings;
  onClose: () => void;
  /**
   * Called on close. The modal supplies the final draft and two flags
   * indicating whether the host should persist to localStorage and whether
   * the session needs to be reset for exercise changes.
   */
  onSave: (draft: Settings, flags: { shouldPersist: boolean; shouldResetExercises: boolean }) => void;
  /** Called when the user clicks "Reset to default" — host clears localStorage. */
  onClearStorage: () => void;
}

type TabId = 'exercise' | 'midi';

/** Whether any exercise-affecting setting differs between `a` and `b`. */
function exerciseSettingsDiffer(a: Settings, b: Settings): boolean {
  const arrEq = <T,>(x: T[], y: T[]): boolean => {
    if (x.length !== y.length) return false;
    const set = new Set<T>(y);
    for (const v of x) if (!set.has(v)) return false;
    return true;
  };
  return (
    !arrEq(a.keySignatureIds, b.keySignatureIds) ||
    !arrEq(a.exerciseTypes, b.exerciseTypes) ||
    !arrEq(a.staffFigures, b.staffFigures) ||
    !arrEq(a.staffClefs, b.staffClefs) ||
    !arrEq(a.leadFigures, b.leadFigures) ||
    a.setLength !== b.setLength
  );
}

/** Deep-ish equality for two Settings objects (treats array order as irrelevant). */
function settingsEqual(a: Settings, b: Settings): boolean {
  if (exerciseSettingsDiffer(a, b)) return false;
  return (
    a.numeralSystem === b.numeralSystem &&
    a.showReveal === b.showReveal &&
    a.promptDuration === b.promptDuration &&
    a.revealDuration === b.revealDuration &&
    a.playExternalMidi === b.playExternalMidi
  );
}

export function SettingsModal({
  open,
  settings,
  onClose,
  onSave,
  onClearStorage,
}: SettingsModalProps) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [activeTab, setActiveTab] = useState<TabId>('exercise');
  const rowRefs = useRef<Record<ErrorKey, HTMLDivElement | null>>({
    keySignatures: null,
    exerciseTypes: null,
    staffFigures: null,
    staffClefs: null,
    leadFigures: null,
  });

  /**
   * Baseline for "do we need to persist?": what's currently in localStorage,
   * conceptually. Initialized from the `settings` prop when the modal opens.
   * Updated to `DEFAULT_SETTINGS` when the user clicks "Reset to default" (so
   * that closing immediately afterward — with no further edits — doesn't
   * re-persist defaults to storage).
   */
  const persistedBaselineRef = useRef<Settings>(settings);
  /**
   * Baseline for "do we need to reset exercises?": what `settings` was when
   * the modal opened. Compared to the final draft on close.
   */
  const openBaselineRef = useRef<Settings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setActiveTab('exercise');
      persistedBaselineRef.current = settings;
      openBaselineRef.current = settings;
    }
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
  const hasErrors = errorsExist(errors);

  const handleClose = () => {
    if (hasErrors) {
      // All current validations live on the Exercise Settings tab; switch to
      // it so the error rows are reachable, then scroll to the first error.
      setActiveTab('exercise');
      for (const key of FIELD_ORDER) {
        if (errors[key]) {
          const node = rowRefs.current[key];
          if (node) {
            // Defer one frame so the tab switch has applied to the DOM.
            requestAnimationFrame(() =>
              node.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            );
          }
          break;
        }
      }
      return;
    }
    const shouldPersist = !settingsEqual(draft, persistedBaselineRef.current);
    const shouldResetExercises = exerciseSettingsDiffer(draft, openBaselineRef.current);
    onSave(draft, { shouldPersist, shouldResetExercises });
    onClose();
  };

  const handleResetToDefault = () => {
    setDraft(DEFAULT_SETTINGS);
    // After reset, the new "persisted baseline" is the cleared state: i.e.,
    // closing without further edits should not re-write defaults to storage.
    onClearStorage();
    persistedBaselineRef.current = DEFAULT_SETTINGS;
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
        <div className="modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'exercise'}
            className={`modal-tab${activeTab === 'exercise' ? ' active' : ''}${hasErrors ? ' has-error' : ''}`}
            onClick={() => setActiveTab('exercise')}
          >
            Exercise Settings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'midi'}
            className={`modal-tab${activeTab === 'midi' ? ' active' : ''}`}
            onClick={() => setActiveTab('midi')}
          >
            MIDI Settings
          </button>
        </div>
        <div className="modal-body">

          <div hidden={activeTab !== 'exercise'} role="tabpanel">

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

          </div>{/* /tabpanel: exercise */}

          <div hidden={activeTab !== 'midi'} role="tabpanel">

            <div className="form-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.playExternalMidi}
                  onChange={(e) => setDraft({ ...draft, playExternalMidi: e.target.checked })}
                />
                <span>Play external MIDI</span>
              </label>
            </div>

          </div>{/* /tabpanel: midi */}

        </div>
        <div className="footer-actions">
          <button className="btn" onClick={handleResetToDefault}>Reset to default</button>
          <button className="btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
