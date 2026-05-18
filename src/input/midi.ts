import { useEffect, useRef } from 'react';

interface MidiAccessLike {
  inputs: { values: () => Iterable<MidiInputLike> };
  addEventListener: (
    type: 'statechange',
    handler: (e: { port: MidiPortLike }) => void,
  ) => void;
  removeEventListener: (
    type: 'statechange',
    handler: (e: { port: MidiPortLike }) => void,
  ) => void;
}
interface MidiPortLike {
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
}
interface MidiInputLike extends MidiPortLike {
  type: 'input';
  onmidimessage: ((e: MidiMessageEvent) => void) | null;
}
interface MidiMessageEvent {
  data: Uint8Array;
}

interface UseMidiInputOptions {
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
  /** Damper / sustain pedal down (MIDI CC 64 value >= 64). */
  pedalDown: () => void;
  /** Damper / sustain pedal up (MIDI CC 64 value < 64). */
  pedalUp: () => void;
}

/**
 * Web MIDI input listener (§5.2 of requirements.md).
 *
 * Requests MIDI access lazily on the first user interaction with the document
 * (the browser requires a user gesture for the prompt). Once granted,
 * subscribes to all current and future input devices' note messages and
 * dispatches them to the provided handlers.
 *
 * If the Web MIDI API is unavailable, this hook is a no-op (feature
 * degrades gracefully — see §5.2).
 */
export function useMidiInput({
  noteOn,
  noteOff,
  pedalDown,
  pedalUp,
}: UseMidiInputOptions): void {
  const noteOnRef = useRef(noteOn);
  const noteOffRef = useRef(noteOff);
  const pedalDownRef = useRef(pedalDown);
  const pedalUpRef = useRef(pedalUp);
  // Keep refs current so the message handler always uses latest callbacks
  // without re-subscribing.
  useEffect(() => {
    noteOnRef.current = noteOn;
    noteOffRef.current = noteOff;
    pedalDownRef.current = pedalDown;
    pedalUpRef.current = pedalUp;
  }, [noteOn, noteOff, pedalDown, pedalUp]);

  useEffect(() => {
    const nav = navigator as unknown as {
      requestMIDIAccess?: () => Promise<MidiAccessLike>;
    };
    if (typeof nav.requestMIDIAccess !== 'function') return;

    let access: MidiAccessLike | null = null;
    let cancelled = false;
    const subscribedInputs = new Set<MidiInputLike>();

    const handleMessage = (e: MidiMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 1) return;
      const status = data[0]!;
      const cmd = status & 0xf0;
      const d1 = data[1] ?? 0;
      const d2 = data[2] ?? 0;
      if (cmd === 0x90) {
        // Note on (velocity 0 == note off, per MIDI spec)
        if (d2 > 0) noteOnRef.current(d1, d2);
        else noteOffRef.current(d1);
      } else if (cmd === 0x80) {
        noteOffRef.current(d1);
      } else if (cmd === 0xb0 && d1 === 64) {
        // Control Change CC 64 = damper / sustain pedal.
        // value >= 64 means down, < 64 means up (MIDI 1.0 spec).
        if (d2 >= 64) pedalDownRef.current();
        else pedalUpRef.current();
      }
    };

    const subscribe = (input: MidiInputLike) => {
      if (subscribedInputs.has(input)) return;
      input.onmidimessage = handleMessage;
      subscribedInputs.add(input);
    };

    const onStateChange = (e: { port: MidiPortLike }) => {
      if (e.port.type === 'input' && e.port.state === 'connected') {
        subscribe(e.port as MidiInputLike);
      }
    };

    const requestAccess = async () => {
      try {
        const a = await nav.requestMIDIAccess!();
        if (cancelled) return;
        access = a;
        for (const input of a.inputs.values()) {
          subscribe(input);
        }
        a.addEventListener('statechange', onStateChange);
      } catch {
        // Permission denied or other error; silently ignore.
      }
    };

    // Wait for the first user gesture (anywhere in the document) before
    // requesting MIDI access, since the browser requires it.
    const onFirstGesture = () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      void requestAccess();
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      if (access) {
        access.removeEventListener('statechange', onStateChange);
      }
      for (const input of subscribedInputs) {
        input.onmidimessage = null;
      }
      subscribedInputs.clear();
    };
  }, []);
}
