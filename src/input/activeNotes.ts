import { useCallback, useRef, useState } from 'react';
import { getSampler, midiToFreqStr } from '../audio/sampler';
import * as Tone from 'tone';

/**
 * Shared "active notes" state model per §5.1 of requirements.md, with damper-
 * pedal support.
 *
 * The active set is the union of two internal sets:
 *   - heldRef: notes the user is currently physically pressing (mouse down,
 *     touch on key, MIDI key down, virtual-keyboard key down).
 *   - sustainedRef: notes that have been physically released while the pedal
 *     was down, so they continue sounding until the pedal is lifted.
 *
 * The pedal applies to all user-played notes regardless of input source.
 * Reveal-phase chord playback bypasses this hook entirely, so the pedal does
 * not affect those notes.
 *
 * Per §5.5: user-played notes are independent of phase transitions; the
 * reveal-phase chord release does not touch this state.
 */
/** Default velocity for mouse / touch input (§5.5). */
export const POINTER_VELOCITY = 0.5;

export interface ActiveNotesAPI {
  /** Current set of active MIDI numbers (held ∪ sustained). */
  activeMidi: ReadonlySet<number>;
  /**
   * Mark a MIDI number as on with normalized velocity in [0, 1]. If the note
   * is already on (held or sustained), this is a no-op.
   */
  noteOn: (midi: number, velocity?: number) => void;
  /**
   * Mark a MIDI number as off. If the pedal is down, the note transitions to
   * sustained instead of being released. Otherwise it's released immediately.
   */
  noteOff: (midi: number) => void;
  /** Damper pedal down. */
  pedalDown: () => void;
  /** Damper pedal up. Releases any sustained-only (not-currently-held) notes. */
  pedalUp: () => void;
  /** Release every active note. Used by global-cancel edge cases. */
  releaseAll: () => void;
}

export function useActiveNotes(): ActiveNotesAPI {
  const [activeMidi, setActiveMidi] = useState<ReadonlySet<number>>(() => new Set());
  // Live mirrors for use inside callbacks (to avoid stale closures).
  const heldRef = useRef<Set<number>>(new Set());
  const sustainedRef = useRef<Set<number>>(new Set());
  const pedalDownRef = useRef<boolean>(false);

  const publish = useCallback(() => {
    const merged = new Set<number>(heldRef.current);
    for (const m of sustainedRef.current) merged.add(m);
    setActiveMidi(merged);
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (Tone.getContext().state !== 'running') {
      void Tone.start();
    }
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity: number = POINTER_VELOCITY) => {
      // Already physically held: ignore (no re-trigger).
      if (heldRef.current.has(midi)) return;
      // If the note was sustained, attacking again is a fresh strike, so
      // remove it from the sustained set and re-trigger.
      const wasSustained = sustainedRef.current.delete(midi);
      heldRef.current.add(midi);
      publish();
      ensureAudioContext();
      const sampler = getSampler();
      const clamped = Math.max(0, Math.min(1, velocity));
      // If it was sustained, release first so the new attack is clean.
      if (wasSustained) {
        sampler.triggerRelease(midiToFreqStr(midi));
      }
      sampler.triggerAttack(midiToFreqStr(midi), undefined, clamped);
    },
    [ensureAudioContext, publish],
  );

  const noteOff = useCallback(
    (midi: number) => {
      if (!heldRef.current.has(midi)) return;
      heldRef.current.delete(midi);
      if (pedalDownRef.current) {
        // Transition to sustained; do not release the sample.
        sustainedRef.current.add(midi);
        publish();
      } else {
        publish();
        getSampler().triggerRelease(midiToFreqStr(midi));
      }
    },
    [publish],
  );

  const pedalDown = useCallback(() => {
    pedalDownRef.current = true;
  }, []);

  const pedalUp = useCallback(() => {
    pedalDownRef.current = false;
    // Release every sustained-only note (i.e., not currently held).
    const sampler = getSampler();
    const toRelease: number[] = [];
    for (const m of sustainedRef.current) {
      if (!heldRef.current.has(m)) toRelease.push(m);
    }
    if (toRelease.length === 0) return;
    for (const m of toRelease) {
      sustainedRef.current.delete(m);
      sampler.triggerRelease(midiToFreqStr(m));
    }
    publish();
  }, [publish]);

  const releaseAll = useCallback(() => {
    if (heldRef.current.size === 0 && sustainedRef.current.size === 0) return;
    const sampler = getSampler();
    for (const m of heldRef.current) sampler.triggerRelease(midiToFreqStr(m));
    for (const m of sustainedRef.current) sampler.triggerRelease(midiToFreqStr(m));
    heldRef.current.clear();
    sustainedRef.current.clear();
    setActiveMidi(new Set());
  }, []);

  return { activeMidi, noteOn, noteOff, pedalDown, pedalUp, releaseAll };
}
