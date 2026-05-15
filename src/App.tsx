import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import abcjs from 'abcjs';
import './App.css';
import { SettingsModal } from './components/SettingsModal';
import { StaffDisplay, centerInnerGroup } from './components/StaffDisplay';
import { LeadSheetDisplay } from './components/LeadSheetDisplay';
import { PianoRoll } from './components/PianoRoll';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from './state/settings';
import {
  generateExercise,
  pickNextSet,
  type SetSpec,
} from './music/generator';
import { keyDisplayName } from './music/numeral';
import type { Exercise } from './music/types';
import { noteToMidi } from './music/midi';
import { playChord, waitForSamples } from './audio/sampler';

type Phase = 'cue' | 'prompt' | 'reveal';

interface SessionState {
  setSpec: SetSpec | null;
  setHistory: SetSpec[];
  withinSetBuffer: string[];
  exerciseInSet: number;
  currentExercise: Exercise | null;
  phase: Phase;
  paused: boolean;
  nextEnabledAt: number;
}

const initialSession: SessionState = {
  setSpec: null,
  setHistory: [],
  withinSetBuffer: [],
  exerciseInSet: 0,
  currentExercise: null,
  phase: 'cue',
  paused: true,
  nextEnabledAt: 0,
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState<SessionState>(initialSession);

  const timerRef = useRef<number | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    waitForSamples().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (session.setSpec === null) {
      const first = pickNextSet(settings, []);
      if (first) {
        setSession((s) => ({ ...s, setSpec: first, setHistory: [first] }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setSession((prev) => {
      if (prev.phase === 'cue') {
        if (!prev.setSpec) return prev;
        const ex = generateExercise(prev.setSpec, settings, prev.withinSetBuffer);
        if (!ex) return prev;
        return {
          ...prev,
          currentExercise: ex,
          phase: 'prompt',
          exerciseInSet: 1,
          withinSetBuffer: [...prev.withinSetBuffer, ex.shuffleKey],
          nextEnabledAt: Date.now() + 1000,
        };
      }
      if (prev.phase === 'prompt') {
        return { ...prev, phase: 'reveal', nextEnabledAt: Date.now() + 1000 };
      }
      if (prev.phase === 'reveal') {
        if (releaseRef.current) {
          releaseRef.current();
          releaseRef.current = null;
        }
        if (prev.exerciseInSet >= settings.setLength) {
          const next = pickNextSet(settings, prev.setHistory);
          if (!next) return prev;
          return {
            ...prev,
            setSpec: next,
            setHistory: [...prev.setHistory, next],
            withinSetBuffer: [],
            exerciseInSet: 0,
            currentExercise: null,
            phase: 'cue',
            nextEnabledAt: Date.now() + 1000,
          };
        }
        if (!prev.setSpec) return prev;
        const ex = generateExercise(prev.setSpec, settings, prev.withinSetBuffer);
        if (!ex) return prev;
        return {
          ...prev,
          currentExercise: ex,
          phase: 'prompt',
          exerciseInSet: prev.exerciseInSet + 1,
          withinSetBuffer: [...prev.withinSetBuffer, ex.shuffleKey],
          nextEnabledAt: Date.now() + 1000,
        };
      }
      return prev;
    });
  }, [settings]);

  useEffect(() => {
    if (session.phase === 'reveal' && session.currentExercise && !session.paused) {
      const midis = session.currentExercise.notes.map((n) => noteToMidi(n, 0));
      releaseRef.current = playChord(midis);
    }
    return () => {
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [session.phase, session.currentExercise, session.paused]);

  useEffect(() => {
    clearTimer();
    if (session.paused) return;
    if (session.phase === 'cue') {
      timerRef.current = window.setTimeout(advance, 2000);
    } else if (session.phase === 'prompt') {
      if (settings.promptDuration !== undefined && settings.promptDuration > 0) {
        timerRef.current = window.setTimeout(advance, settings.promptDuration * 1000);
      }
    } else if (session.phase === 'reveal') {
      if (settings.revealDuration !== undefined && settings.revealDuration > 0) {
        timerRef.current = window.setTimeout(advance, settings.revealDuration * 1000);
      }
    }
    return clearTimer;
  }, [session.phase, session.paused, settings.promptDuration, settings.revealDuration, advance, clearTimer]);

  useEffect(() => {
    if (session.nextEnabledAt <= Date.now()) return;
    const t = window.setTimeout(
      () => setNowTick((n) => n + 1),
      session.nextEnabledAt - Date.now() + 10,
    );
    return () => window.clearTimeout(t);
  }, [session.nextEnabledAt, nowTick]);

  const togglePause = () => {
    setSession((s) => ({ ...s, paused: !s.paused }));
  };

  const handleNext = () => {
    if (Date.now() < session.nextEnabledAt) return;
    setSession((s) => ({ ...s, paused: false }));
    advance();
  };

  const nextDisabled = Date.now() < session.nextEnabledAt;
  const hasTimer =
    (settings.promptDuration !== undefined && settings.promptDuration > 0) ||
    (settings.revealDuration !== undefined && settings.revealDuration > 0);

  const onSaveSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    const first = pickNextSet(s, []);
    setSession({
      ...initialSession,
      setSpec: first,
      setHistory: first ? [first] : [],
    });
  };

  const piano = useMemo(() => {
    if (!session.currentExercise || session.phase !== 'reveal') return null;
    const midis = session.currentExercise.notes.map((n) => noteToMidi(n, 0));
    return <PianoRoll highlightedMidi={midis} />;
  }, [session.currentExercise, session.phase]);

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="btn-gear"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </header>

      <main className="exercise-area">
        <div className="exercise-display">
          <div className="exercise-controls">
            {hasTimer && (
              <button
                className="btn btn-icon"
                onClick={togglePause}
                aria-label={session.paused ? 'Play' : 'Pause'}
              >
                {session.paused ? '▶' : '⏸'}
              </button>
            )}
            <button
              className="btn btn-icon"
              onClick={handleNext}
              disabled={nextDisabled}
              aria-label="Next"
            >
              »
            </button>
          </div>

          <div className="exercise-region">
            {session.phase === 'cue' && session.setSpec && (
              <CueDisplay setSpec={session.setSpec} />
            )}
            {session.phase !== 'cue' && session.currentExercise && (
              <>
                {session.currentExercise.exerciseType === 'staff' ? (
                  <StaffDisplay exercise={session.currentExercise} />
                ) : (
                  <LeadSheetDisplay
                    exercise={session.currentExercise}
                    numeralSystem={settings.numeralSystem}
                  />
                )}
                {piano}
              </>
            )}
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
      />
    </div>
  );
}

function CueDisplay({ setSpec }: { setSpec: SetSpec }) {
  if (setSpec.exerciseType === 'leadsheet') {
    return (
      <div className="cue-display lead">
        <div className="cue-key-name">
          {keyDisplayName(setSpec.keySignature, setSpec.displayMode)}
        </div>
      </div>
    );
  }
  return (
    <div className="cue-display staff">
      <EmptyStaff keyId={setSpec.keySignature.id} />
    </div>
  );
}

function EmptyStaff({ keyId }: { keyId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const abc =
      `X:1\nL:1\nM:none\n` +
      `%%score {T | B}\n` +
      `V:T clef=treble\nV:B clef=bass\n` +
      `K:${keyId}\n` +
      `[V:T]z|\n[V:B]z|\n`;
    abcjs.renderAbc(ref.current, abc, {
      staffwidth: 320,
      scale: 1.2,
      responsive: 'resize',
    });
    centerInnerGroup(ref.current);
  }, [keyId]);
  return <div ref={ref} className="staff-display" />;
}
