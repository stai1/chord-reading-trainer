import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { SettingsModal } from './components/SettingsModal';
import { StaffDisplay } from './components/StaffDisplay';
import { LeadSheetDisplay } from './components/LeadSheetDisplay';
import { PianoRoll } from './components/PianoRoll';
import { renderEmptyStaff } from './music/vexRender';
import { KEY_SIGNATURES } from './music/types';
import {
  DEFAULT_SETTINGS,
  clearSettings,
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
import { useActiveNotes } from './input/activeNotes';
import { useMidiInput } from './input/midi';

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
  paused: false,
  nextEnabledAt: 0,
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState<SessionState>(initialSession);

  const timerRef = useRef<number | null>(null);
  const releaseRef = useRef<((skip?: (midi: number) => boolean) => void) | null>(null);
  const [nowTick, setNowTick] = useState(0);

  // Active notes (user input from MIDI keyboard / mouse / touch). Shared state
  // driving piano-roll blue highlight and audio playback. (§5.1 / §5.5)
  const { activeMidi, noteOn, noteOff } = useActiveNotes();
  useMidiInput({
    noteOn: (m, velocity) =>
      noteOn(m, settings.playExternalMidi ? velocity / 127 : 0),
    noteOff,
  });
  // Mirror activeMidi so the reveal-release callback can filter against it
  // without re-creating the callback on every active-set change.
  const activeMidiRef = useRef<ReadonlySet<number>>(activeMidi);
  useEffect(() => {
    activeMidiRef.current = activeMidi;
  }, [activeMidi]);

  /**
   * Stacked-timer countdown model.
   *
   * The active phase's duration is broken into a sequence of "ticks":
   *   - an optional fractional first tick of `frac` seconds, where
   *     `frac = duration - floor(duration)`,
   *   - followed by `floor(duration)` ticks of exactly 1 second each.
   *
   * The displayed countdown is the number of ticks remaining (including the
   * in-flight one), so it's a discrete integer count that decrements when each
   * tick fires. The final tick fires `advance()`.
   *
   * Pause/resume: when paused, capture the remaining-ms of the in-flight tick
   * plus the number of full 1s ticks still queued. Resume by rescheduling
   * with that remaining time as the first tick.
   */
  /** Number of ticks remaining (including the in-flight one). Null if no timer. */
  const [ticksRemaining, setTicksRemaining] = useState<number | null>(null);
  /** Absolute ms timestamp when the current in-flight tick fires. */
  const [tickEndsAt, setTickEndsAt] = useState<number | null>(null);
  /** While paused, remaining ms of the in-flight tick at pause time. */
  const pausedRemainingTickMs = useRef<number | null>(null);

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

  // Pause the session while the settings modal is open; resume when it closes.
  useEffect(() => {
    setSession((s) => ({ ...s, paused: settingsOpen }));
  }, [settingsOpen]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    setSession((prev) => {
      /**
       * Returns whether the given phase had an automatic timer under the
       * current settings. Used to decide whether the *next* phase should
       * disable the Next button for 1s.
       *
       * - cue: always has a timer (2s).
       * - prompt: has a timer iff promptDuration is set.
       * - reveal: has a timer iff showReveal is on AND revealDuration is set.
       */
      const phaseHadTimer = (phase: Phase): boolean => {
        if (phase === 'cue') return true;
        if (phase === 'prompt') {
          return settings.promptDuration !== undefined && settings.promptDuration > 0;
        }
        // reveal
        return (
          settings.showReveal &&
          settings.revealDuration !== undefined &&
          settings.revealDuration > 0
        );
      };
      /** Compute nextEnabledAt for a phase transition out of `fromPhase`.
       *  Disable Next for 1s only if the previous shown phase had a timer. */
      const computeNextEnabledAt = (fromPhase: Phase): number => {
        return phaseHadTimer(fromPhase) ? Date.now() + 1000 : 0;
      };

      // Helper: produce the state for "advance past the current exercise" —
      // either generating the next exercise in the same set, or transitioning
      // to a new set's cue. Releases any active audio along the way.
      const advancePastExercise = (state: SessionState): SessionState => {
        if (releaseRef.current) {
          // Skip releasing notes the user is currently holding (§5.5).
          releaseRef.current((m) => activeMidiRef.current.has(m));
          releaseRef.current = null;
        }
        if (state.exerciseInSet >= settings.setLength) {
          const next = pickNextSet(settings, state.setHistory);
          if (!next) return state;
          return {
            ...state,
            setSpec: next,
            setHistory: [...state.setHistory, next],
            withinSetBuffer: [],
            exerciseInSet: 0,
            currentExercise: null,
            phase: 'cue',
            nextEnabledAt: computeNextEnabledAt(state.phase),
          };
        }
        if (!state.setSpec) return state;
        const ex = generateExercise(state.setSpec, settings, state.withinSetBuffer);
        if (!ex) return state;
        return {
          ...state,
          currentExercise: ex,
          phase: 'prompt',
          exerciseInSet: state.exerciseInSet + 1,
          withinSetBuffer: [...state.withinSetBuffer, ex.shuffleKey],
          nextEnabledAt: computeNextEnabledAt(state.phase),
        };
      };

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
          nextEnabledAt: computeNextEnabledAt(prev.phase),
        };
      }
      if (prev.phase === 'prompt') {
        // If reveal is disabled, skip directly to the next exercise (or cue).
        if (!settings.showReveal) {
          return advancePastExercise(prev);
        }
        return {
          ...prev,
          phase: 'reveal',
          nextEnabledAt: computeNextEnabledAt(prev.phase),
        };
      }
      if (prev.phase === 'reveal') {
        return advancePastExercise(prev);
      }
      return prev;
    });
  }, [settings]);

  // Trigger reveal-phase audio when the phase enters 'reveal' (or the current
  // exercise changes within the reveal phase). Pause/resume does NOT re-trigger
  // playback or release notes — notes hold through pauses and are only released
  // when the phase changes, the exercise changes, or settings reset clears the
  // current exercise.
  useEffect(() => {
    if (session.phase === 'reveal' && session.currentExercise) {
      const midis = session.currentExercise.notes.map((n) => noteToMidi(n, 0));
      releaseRef.current = playChord(midis);
    }
    return () => {
      if (releaseRef.current) {
        // Don't release notes the user is currently holding (§5.5).
        releaseRef.current((m) => activeMidiRef.current.has(m));
        releaseRef.current = null;
      }
    };
  }, [session.phase, session.currentExercise]);

  /** Duration of the current phase in seconds, or null if the phase is
   *  indefinite (user-advance only). */
  const phaseDurationSec = useMemo<number | null>(() => {
    if (session.phase === 'cue') return 2;
    if (session.phase === 'prompt') {
      return settings.promptDuration !== undefined && settings.promptDuration > 0
        ? settings.promptDuration
        : null;
    }
    if (session.phase === 'reveal') {
      return settings.revealDuration !== undefined && settings.revealDuration > 0
        ? settings.revealDuration
        : null;
    }
    return null;
  }, [session.phase, settings.promptDuration, settings.revealDuration]);

  // When the phase or current exercise changes, initialize the tick stack.
  // Ticks: optional fractional first tick + ceil(D) ticks total (one of which
  // may be the fractional one). The displayed countdown shows `ticksRemaining`.
  useEffect(() => {
    pausedRemainingTickMs.current = null;
    if (phaseDurationSec === null) {
      setTicksRemaining(null);
      setTickEndsAt(null);
      return;
    }
    const frac = phaseDurationSec - Math.floor(phaseDurationSec);
    const firstTickMs = frac > 0 ? frac * 1000 : 1000;
    const totalTicks = Math.ceil(phaseDurationSec);
    setTicksRemaining(totalTicks);
    if (!session.paused) {
      setTickEndsAt(Date.now() + firstTickMs);
    } else {
      setTickEndsAt(null);
      pausedRemainingTickMs.current = firstTickMs;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase, session.currentExercise, phaseDurationSec]);

  // Pause / resume handling.
  useEffect(() => {
    if (session.paused) {
      if (tickEndsAt !== null) {
        pausedRemainingTickMs.current = Math.max(0, tickEndsAt - Date.now());
        setTickEndsAt(null);
      }
    } else {
      if (pausedRemainingTickMs.current !== null) {
        setTickEndsAt(Date.now() + pausedRemainingTickMs.current);
        pausedRemainingTickMs.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.paused]);

  // Schedule the in-flight tick. When it fires: decrement ticksRemaining; if
  // none left, advance the phase; otherwise queue the next 1-second tick.
  useEffect(() => {
    clearTimer();
    if (session.paused) return;
    if (tickEndsAt === null || ticksRemaining === null) return;

    const remaining = tickEndsAt - Date.now();

    const fire = () => {
      const next = (ticksRemaining ?? 1) - 1;
      if (next <= 0) {
        // This was the last tick: advance the phase.
        setTicksRemaining(null);
        setTickEndsAt(null);
        advance();
      } else {
        setTicksRemaining(next);
        setTickEndsAt(Date.now() + 1000);
      }
    };

    if (remaining <= 0) {
      fire();
      return;
    }
    timerRef.current = window.setTimeout(fire, remaining);
    return clearTimer;
  }, [session.paused, tickEndsAt, ticksRemaining, advance, clearTimer]);

  useEffect(() => {
    if (session.nextEnabledAt <= Date.now()) return;
    const t = window.setTimeout(
      () => setNowTick((n) => n + 1),
      session.nextEnabledAt - Date.now() + 10,
    );
    return () => window.clearTimeout(t);
  }, [session.nextEnabledAt, nowTick]);

  /** Displayed countdown: the number of ticks still queued. Null when no
   *  timer is active. Remains shown while paused (frozen at the current count). */
  const remainingSeconds: number | null = ticksRemaining;

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
    (settings.showReveal &&
      settings.revealDuration !== undefined &&
      settings.revealDuration > 0);

  const onSaveSettings = (
    s: Settings,
    flags: { shouldPersist: boolean; shouldResetExercises: boolean },
  ) => {
    setSettings(s);
    if (flags.shouldPersist) {
      saveSettings(s);
    }
    if (flags.shouldResetExercises) {
      const first = pickNextSet(s, []);
      setSession({
        ...initialSession,
        setSpec: first,
        setHistory: first ? [first] : [],
      });
    }
  };

  const piano = useMemo(() => {
    const isReveal = session.phase === 'reveal';
    const midis =
      isReveal && session.currentExercise
        ? session.currentExercise.notes.map((n) => noteToMidi(n, 0))
        : [];
    return (
      <PianoRoll
        highlightedMidi={midis}
        activeMidi={activeMidi}
        onNoteOn={noteOn}
        onNoteOff={noteOff}
      />
    );
  }, [session.currentExercise, session.phase, activeMidi, noteOn, noteOff]);

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
          <div className="phase-countdown">
            {remainingSeconds !== null && (
              <>
                Next in: <span className="phase-countdown-number">{remainingSeconds}</span>s
              </>
            )}
          </div>
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
              </>
            )}
          </div>
          {piano}
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onClearStorage={clearSettings}
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
    const key = KEY_SIGNATURES.find((k) => k.id === keyId);
    if (!key) return;
    renderEmptyStaff(ref.current, key);
  }, [keyId]);
  return <div ref={ref} className="staff-display" />;
}
