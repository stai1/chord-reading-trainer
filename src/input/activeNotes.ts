import { useCallback, useRef, useState } from 'react';
import { getSampler, midiToFreqStr } from '../audio/sampler';
import * as Tone from 'tone';

/**
 * Shared "active notes" state model per §5.1 of requirements.md.
 *
 * A set of MIDI note numbers currently being played. Updated by note-on /
 * note-off events from any input source (MIDI keyboard, mouse, touch). The
 * same set drives both the piano-roll blue-highlight overlay and the audio
 * playback of user-played notes.
 *
 * Per §5.5: user-played notes are independent of phase transitions; the
 * reveal-phase chord release does not touch this state. Notes are released
 * only by their corresponding input-side note-off events.
 */
/** Default velocity for mouse / touch input (§5.5). */
export const POINTER_VELOCITY = 0.5;

export interface ActiveNotesAPI {
  /** Current set of active MIDI numbers. */
  activeMidi: ReadonlySet<number>;
  /**
   * Mark a MIDI number as on with normalized velocity in [0, 1]. If the note
   * is already on, this is a no-op (no re-trigger).
   */
  noteOn: (midi: number, velocity?: number) => void;
  /** Mark a MIDI number as off. Releases the sample if currently on. */
  noteOff: (midi: number) => void;
  /** Release every active note. Used by global-cancel edge cases. */
  releaseAll: () => void;
}

export function useActiveNotes(): ActiveNotesAPI {
  const [activeMidi, setActiveMidi] = useState<ReadonlySet<number>>(() => new Set());
  // A live mirror of activeMidi for use inside callbacks (to avoid stale closures).
  const liveRef = useRef<Set<number>>(new Set());

  const ensureAudioContext = useCallback(() => {
    if (Tone.getContext().state !== 'running') {
      void Tone.start();
    }
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity: number = POINTER_VELOCITY) => {
      if (liveRef.current.has(midi)) return;
      liveRef.current.add(midi);
      setActiveMidi(new Set(liveRef.current));
      ensureAudioContext();
      const sampler = getSampler();
      const clamped = Math.max(0, Math.min(1, velocity));
      sampler.triggerAttack(midiToFreqStr(midi), undefined, clamped);
    },
    [ensureAudioContext],
  );

  const noteOff = useCallback((midi: number) => {
    if (!liveRef.current.has(midi)) return;
    liveRef.current.delete(midi);
    setActiveMidi(new Set(liveRef.current));
    const sampler = getSampler();
    sampler.triggerRelease(midiToFreqStr(midi));
  }, []);

  const releaseAll = useCallback(() => {
    if (liveRef.current.size === 0) return;
    const sampler = getSampler();
    for (const midi of liveRef.current) {
      sampler.triggerRelease(midiToFreqStr(midi));
    }
    liveRef.current.clear();
    setActiveMidi(new Set());
  }, []);

  return { activeMidi, noteOn, noteOff, releaseAll };
}
