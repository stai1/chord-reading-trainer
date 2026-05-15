import { useState, useEffect } from 'react';
import type { Settings } from '../state/settings';
import { KEY_SIGNATURES } from '../music/types';
import type { Clef, ExerciseType, FigureType, NumeralSystem } from '../music/types';

interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Settings) => void;
}

export function SettingsModal({ open, settings, onClose, onSave }: SettingsModalProps) {
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings, open]);

  if (!open) return null;

  const handleClose = () => {
    onSave(draft);
    onClose();
  };

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const bothEnabled =
    draft.staffFigures.includes('triad') || draft.staffFigures.includes('7th');

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleClose} aria-label="Close settings">×</button>
        </div>
        <div className="modal-body">

          <div className="form-row">
            <label>Key signatures</label>
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
          </div>

          <div className="form-row">
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
          </div>

          <div className="form-row">
            <label>Staff sight reading figures</label>
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
          </div>

          <div className="form-row">
            <label>Staff sight reading clefs</label>
            <div className="multi-list">
              {(['treble', 'bass', 'both'] as Clef[]).map((c) => (
                <label key={c} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={draft.staffClefs.includes(c)}
                    disabled={
                      !draft.exerciseTypes.includes('staff') ||
                      (c === 'both' && !bothEnabled)
                    }
                    onChange={() => setDraft({ ...draft, staffClefs: toggle(draft.staffClefs, c) })}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <div className="help">"both" requires triad or 7th.</div>
          </div>

          <div className="form-row">
            <label>Lead sheet reading figures</label>
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
              min={0}
              step={0.1}
              value={draft.promptDuration ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({ ...draft, promptDuration: v === '' ? undefined : Math.max(0, parseFloat(v)) });
              }}
            />
            <div className="help">Leave empty for indefinite (advance only on Next).</div>
          </div>

          <div className="form-row">
            <label htmlFor="reveal-duration">Reveal duration (seconds)</label>
            <input
              id="reveal-duration"
              type="number"
              min={0}
              step={0.1}
              value={draft.revealDuration ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setDraft({ ...draft, revealDuration: v === '' ? undefined : Math.max(0, parseFloat(v)) });
              }}
            />
            <div className="help">Leave empty for indefinite (advance only on Next).</div>
          </div>

        </div>
        <div className="footer-actions">
          <button className="btn" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
