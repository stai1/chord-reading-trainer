import { useEffect, useRef } from 'react';

/**
 * Dev-only "virtual MIDI keyboard" backed by the computer keyboard.
 *
 * Maps two rows of keys to two ranges of MIDI notes (with overlap):
 *   - Bottom row:  z s x d c v g b h n j m , l . ; /     => C3 .. E4
 *   - Top row:     q 2 w 3 e r 5 t 6 y 7 u i 9 o 0 p [ = ]  => C4 .. A5
 *
 * Each key press emits a noteOn at half velocity (64/127, normalized 0.504),
 * matching the spec's recommendation for "half of maximum" pointer-style input
 * but routed through the *external-MIDI* path so the "Play external MIDI"
 * setting applies. (The caller passes their MIDI noteOn callback directly.)
 *
 * Active only in dev: import.meta.env.DEV must be true. In production builds
 * this hook is a no-op.
 *
 * Active only when the settings modal is closed (caller passes `enabled`).
 * Releases all currently-held virtual keys when `enabled` flips to false.
 */
interface UseVirtualKeyboardOptions {
  enabled: boolean;
  /** Called like a MIDI noteon: velocity 0..127. */
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
}

/** Key event `.code` => MIDI number. Uses physical key codes so layout is
 *  independent of the user's keyboard locale. */
const KEYMAP: Record<string, number> = {
  // Bottom row, white keys + black keys interleaved.
  // C3 = MIDI 48. The mapping below uses one chromatic semitone per slot.
  // "zsxdcvgbhnjm,l.;/" => 17 keys => C3..E4.
  KeyZ: 48, // C3
  KeyS: 49, // C#3
  KeyX: 50, // D3
  KeyD: 51, // D#3
  KeyC: 52, // E3
  KeyV: 53, // F3
  KeyG: 54, // F#3
  KeyB: 55, // G3
  KeyH: 56, // G#3
  KeyN: 57, // A3
  KeyJ: 58, // A#3
  KeyM: 59, // B3
  Comma: 60, // C4
  KeyL: 61, // C#4
  Period: 62, // D4
  Semicolon: 63, // D#4
  Slash: 64, // E4

  // Top row "q2w3er5t6y7ui9o0p[=]" => 20 keys => C4..G#5 + A5.
  KeyQ: 60, // C4
  Digit2: 61, // C#4
  KeyW: 62, // D4
  Digit3: 63, // D#4
  KeyE: 64, // E4
  KeyR: 65, // F4
  Digit5: 66, // F#4
  KeyT: 67, // G4
  Digit6: 68, // G#4
  KeyY: 69, // A4
  Digit7: 70, // A#4
  KeyU: 71, // B4
  KeyI: 72, // C5
  Digit9: 73, // C#5
  KeyO: 74, // D5
  Digit0: 75, // D#5
  KeyP: 76, // E5
  BracketLeft: 77, // F5
  Equal: 78, // F#5
  BracketRight: 79, // G5
  // No physical key for "]" + "=" mapped further; "A5" (81) intentionally
  // beyond this row per the spec. Most layouts don't have a slot beyond
  // BracketRight on the top row.
};

const HALF_VELOCITY = 64; // 64 / 127 ≈ 0.504

export function useVirtualKeyboard({
  enabled,
  noteOn,
  noteOff,
}: UseVirtualKeyboardOptions): void {
  // Track which MIDI notes are currently held by this virtual keyboard so we
  // can release them on disable / unmount and handle no-repeat correctly.
  const heldRef = useRef<Set<string>>(new Set());
  const noteOnRef = useRef(noteOn);
  const noteOffRef = useRef(noteOff);
  useEffect(() => {
    noteOnRef.current = noteOn;
    noteOffRef.current = noteOff;
  }, [noteOn, noteOff]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!enabled) {
      // Release everything currently held.
      for (const code of heldRef.current) {
        const midi = KEYMAP[code];
        if (midi !== undefined) noteOffRef.current(midi);
      }
      heldRef.current.clear();
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const midi = KEYMAP[code];
      if (midi === undefined) return;
      // Ignore auto-repeat; native keyboards repeat key-down events while held.
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (heldRef.current.has(code)) {
        e.preventDefault();
        return;
      }
      heldRef.current.add(code);
      noteOnRef.current(midi, HALF_VELOCITY);
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const midi = KEYMAP[code];
      if (midi === undefined) return;
      if (!heldRef.current.has(code)) return;
      heldRef.current.delete(code);
      noteOffRef.current(midi);
      e.preventDefault();
    };

    const releaseAll = () => {
      for (const code of heldRef.current) {
        const midi = KEYMAP[code];
        if (midi !== undefined) noteOffRef.current(midi);
      }
      heldRef.current.clear();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAll();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseAll();
    };
  }, [enabled]);
}
