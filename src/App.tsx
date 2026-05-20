import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { SettingsModal } from './components/SettingsModal';
import { StaffDisplay } from './components/StaffDisplay';
import { LeadSheetDisplay } from './components/LeadSheetDisplay';
import { PianoRoll } from './components/PianoRoll';
import { renderEmptyStaff } from './music/vexRender';
import { KEY_SIGNATURES } from './music/types';
import {
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
import { useVirtualKeyboard } from './input/virtualKeyboard';

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
  // Load persisted settings synchronously so the first render reflects them
  // (and downstream effects like "pick first set" use the right values).
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState<SessionState>(initialSession);

  const timerRef = useRef<number | null>(null);
  const releaseRef = useRef<((skip?: (midi: number) => boolean) => void) | null>(null);
  const [nowTick, setNowTick] = useState(0);

  // Active notes (user input from MIDI keyboard / mouse / touch). Shared state
  // driving piano-roll blue highlight and audio playback. (§5.1 / §5.5)
  const { activeMidi, noteOn, noteOff, pedalDown, pedalUp } = useActiveNotes();
  // External-MIDI note-on path: normalize velocity, or silence if "Play
  // external MIDI" is off. Shared by Web MIDI and the dev-only virtual
  // computer-keyboard input.
  const externalNoteOn = useCallback(
    (m: number, velocity: number) =>
      noteOn(m, settings.playExternalMidi ? velocity / 127 : 0),
    [noteOn, settings.playExternalMidi],
  );
  useMidiInput({ noteOn: externalNoteOn, noteOff, pedalDown, pedalUp });
  // Dev-only virtual keyboard. Disabled while the settings modal is open,
  // which causes it to release any held notes.
  useVirtualKeyboard({
    enabled: !settingsOpen,
    noteOn: externalNoteOn,
    noteOff,
    pedalDown,
    pedalUp,
  });
  // Mirror activeMidi so the reveal-release callback can filter against it
  // without re-creating the callback on every active-set change.
  const activeMidiRef = useRef<ReadonlySet<number>>(activeMidi);
  useEffect(() => {
    activeMidiRef.current = activeMidi;
  }, [activeMidi]);

  /**
   * Phase-timer model.
   *
   * A single setTimeout fires `advance()` when the phase's duration elapses.
   * `phaseStartedAt` records when the active phase began (in ms; nulled when
   * the phase has no automatic timer). `phaseTotalMs` is the full duration.
   * On pause, the remaining-ms is captured into a ref so resume can restart
   * with that remainder.
   *
   * For the pie-clock indicator on the play/pause button, a requestAnimationFrame
   * loop publishes `progress` (0..1) while the phase is running. The loop stops
   * on pause and when no timer is active.
   */
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [phaseTotalMs, setPhaseTotalMs] = useState<number | null>(null);
  const pausedRemainingMsRef = useRef<number | null>(null);
  /** 0..1 — fraction of the current phase that has elapsed (clockwise pie). */
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
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
  // Skip the initial mount so the session keeps its initial `paused: true`
  // (which gates audio behind the user's first play press, satisfying mobile
  // autoplay policy).
  const settingsOpenedOnce = useRef(false);
  useEffect(() => {
    if (!settingsOpenedOnce.current) {
      settingsOpenedOnce.current = settingsOpen;
      if (!settingsOpen) return;
    }
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

  // When the phase or current exercise changes, initialize the timer baseline.
  // Pause/resume handling lives in a separate effect.
  useEffect(() => {
    pausedRemainingMsRef.current = null;
    if (phaseDurationSec === null) {
      setPhaseStartedAt(null);
      setPhaseTotalMs(null);
      setProgress(0);
      return;
    }
    const total = phaseDurationSec * 1000;
    setPhaseTotalMs(total);
    if (!session.paused) {
      setPhaseStartedAt(Date.now());
    } else {
      setPhaseStartedAt(null);
      pausedRemainingMsRef.current = total;
    }
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.phase, session.currentExercise, phaseDurationSec]);

  // Pause / resume: capture remaining ms on pause; restore on resume by
  // shifting `phaseStartedAt` so (now - startedAt) equals the elapsed-before-pause.
  useEffect(() => {
    if (session.paused) {
      if (phaseStartedAt !== null && phaseTotalMs !== null) {
        const elapsed = Date.now() - phaseStartedAt;
        pausedRemainingMsRef.current = Math.max(0, phaseTotalMs - elapsed);
        setPhaseStartedAt(null);
      }
    } else {
      if (pausedRemainingMsRef.current !== null && phaseTotalMs !== null) {
        // Reconstitute a virtual start time such that the remaining ms still
        // counts down correctly.
        const elapsedBeforePause = phaseTotalMs - pausedRemainingMsRef.current;
        setPhaseStartedAt(Date.now() - elapsedBeforePause);
        pausedRemainingMsRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.paused]);

  // Single setTimeout to advance the phase when its duration elapses.
  useEffect(() => {
    clearTimer();
    if (session.paused) return;
    if (phaseStartedAt === null || phaseTotalMs === null) return;
    const remaining = phaseStartedAt + phaseTotalMs - Date.now();
    if (remaining <= 0) {
      advance();
      return;
    }
    timerRef.current = window.setTimeout(() => advance(), remaining);
    return clearTimer;
  }, [session.paused, phaseStartedAt, phaseTotalMs, advance, clearTimer]);

  // Animation loop that publishes `progress` (0..1) while the timer runs.
  useEffect(() => {
    if (session.paused) return;
    if (phaseStartedAt === null || phaseTotalMs === null) return;
    let raf = 0;
    const update = () => {
      const elapsed = Date.now() - phaseStartedAt;
      const p = Math.min(1, Math.max(0, elapsed / phaseTotalMs));
      setProgress(p);
      if (p < 1) raf = window.requestAnimationFrame(update);
    };
    raf = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(raf);
  }, [session.paused, phaseStartedAt, phaseTotalMs]);

  // Re-render to re-enable the Next button after its 1-second disable window.
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
  /** True when the current phase has an automatic timer. Drives the
   *  enabled-state of the play/pause button and the visibility of its
   *  surrounding pie-clock indicator. */
  const currentPhaseHasTimer = phaseDurationSec !== null;

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
      <button
        className="btn-gear settings-fab"
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        aria-label="Open settings"
      >
        ⚙
      </button>

      <main className="exercise-area">
        <div className="exercise-display">
          <div className="exercise-controls">
            <button
              className="btn btn-icon play-pause-btn"
              onClick={togglePause}
              disabled={!currentPhaseHasTimer}
              aria-label={session.paused ? 'Play' : 'Pause'}
            >
              {currentPhaseHasTimer && (
                <PhaseClock progress={progress} />
              )}
              <span className="play-pause-icon" aria-hidden>
                {session.paused ? <PlayGlyph /> : <PauseGlyph />}
              </span>
            </button>
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

/**
 * Simple SVG glyphs for the play/pause button — using the unicode characters
 * directly (⏸, ▶) makes iOS/Android render them as emoji.
 */
function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="ctrl-glyph">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="ctrl-glyph">
      <path d="M7 4 L20 12 L7 20 Z" />
    </svg>
  );
}

/**
 * Filled circle overlay for the play/pause button. A pie slice is cut from
 * the circle starting at 12 o'clock and sweeping clockwise by `progress` of
 * the full revolution (0..1). When progress is 0, the full circle shows;
 * when progress is 1, nothing shows.
 *
 * Implementation: render the remaining sector as an SVG <path> via the arc
 * command. The sector spans `progress*2π` from 12 o'clock onward — the area
 * "still to elapse" — but you asked for the slice "taken out" to grow with
 * elapsed time, so we draw the *unelapsed* sector, which shrinks.
 */
function PhaseClock({ progress }: { progress: number }) {
  const SIZE = 56; // matches .btn-icon dimensions roughly
  const R = 26; // radius
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  // Clamp progress.
  const p = Math.min(1, Math.max(0, progress));
  // Angle (radians) of the *elapsed* sector, starting at 12 o'clock and
  // sweeping clockwise. The unelapsed sector spans from `p*2π` to `2π`
  // (clockwise) on a clock-face mapping.
  if (p >= 1) return null;
  if (p <= 0) {
    return (
      <svg className="phase-clock" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <circle cx={CX} cy={CY} r={R} className="phase-clock-fill" />
      </svg>
    );
  }
  // Convert angle (clockwise from 12 o'clock) to x/y on the circle.
  const angleToXY = (theta: number) => {
    const x = CX + R * Math.sin(theta);
    const y = CY - R * Math.cos(theta);
    return [x, y] as const;
  };
  const startTheta = p * 2 * Math.PI;
  const endTheta = 2 * Math.PI;
  const [sx, sy] = angleToXY(startTheta);
  const sweep = endTheta - startTheta;
  const largeArc = sweep > Math.PI ? 1 : 0;
  // After the arc, we close back through the center to form a wedge.
  // End point of arc is at 12 o'clock (top), which is (CX, CY - R).
  const d = `M ${CX} ${CY} L ${sx} ${sy} A ${R} ${R} 0 ${largeArc} 1 ${CX} ${CY - R} Z`;
  return (
    <svg className="phase-clock" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <path d={d} className="phase-clock-fill" />
    </svg>
  );
}
