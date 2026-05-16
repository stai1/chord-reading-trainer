import { useEffect, useRef } from 'react';
import { renderSVG } from 'svg-piano';
import { midiToFreqStr } from '../audio/sampler';

interface PianoRollProps {
  /** MIDI numbers highlighted red (reveal-phase chord). */
  highlightedMidi: number[];
  /** MIDI numbers highlighted blue (currently-played user input). Overrides red. */
  activeMidi?: ReadonlySet<number>;
  /** Called on note-on (mouse/touch press starting on this piano roll). */
  onNoteOn?: (midi: number) => void;
  /** Called on note-off (mouse/touch release of a previously-pressed key). */
  onNoteOff?: (midi: number) => void;
  /** Called once when the user begins dragging on the piano roll (mousedown
   *  or touchstart on a key). Used by App.tsx for global edge-case cleanup. */
  onDragStart?: () => void;
}

/**
 * 61-key piano roll (C2-C7) using svg-piano. Highlights chord notes in red,
 * user-played notes in blue (overriding red). Handles sweep-aware mouse and
 * touch input that emits note-on / note-off events.
 */
export function PianoRoll({
  highlightedMidi,
  activeMidi,
  onNoteOn,
  onNoteOff,
  onDragStart,
}: PianoRollProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Whether the current mouse drag began on this piano roll. Without this,
  // sweeping in from outside would trigger notes (per §5.3 explicitly forbidden).
  const mouseDragActive = useRef(false);
  // The MIDI number the mouse is currently pressing (only one at a time).
  const mouseCurrentMidi = useRef<number | null>(null);
  // Active touches and their current MIDI numbers (per §5.4 multi-touch).
  const touchCurrentMidi = useRef<Map<number, number>>(new Map());
  // Whether each touch began on the piano roll.
  const touchDragActive = useRef<Map<number, boolean>>(new Map());

  // Compute color sets. Blue (active) overrides red (highlighted).
  const activeNames = activeMidi
    ? [...activeMidi].map(midiToFreqStr)
    : [];
  const activeSet = new Set(activeNames);
  const redNames = highlightedMidi
    .map(midiToFreqStr)
    .filter((n) => !activeSet.has(n));

  const colorize: { keys: string[]; color: string }[] = [];
  if (redNames.length > 0) colorize.push({ keys: redNames, color: '#d33' });
  if (activeNames.length > 0) colorize.push({ keys: activeNames, color: '#37c' });

  const rendered = renderSVG({
    range: ['C2', 'C7'],
    colorize,
    upperHeight: 80,
    lowerHeight: 36,
    scaleX: 0.85,
    scaleY: 0.85,
  });

  const viewW = rendered.svg.width;
  const viewH = rendered.svg.height;

  // Map rendered key elements -> MIDI number. svg-piano's rendered.children
  // is in order; we recompute midi numbers in the same order.
  const visibleMidiForIndex: (number | null)[] = (() => {
    const out: (number | null)[] = [];
    let midi = 36; // C2
    for (const child of rendered.children) {
      if (child === undefined) {
        out.push(null);
      } else {
        out.push(midi);
      }
      midi += 1;
    }
    return out;
  })();

  /** Hit-test a clientX/clientY against the rendered piano-roll polygons.
   *  Returns the MIDI number for the topmost key under the point, or null. */
  const hitTest = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof Element)) return null;
    if (!svg.contains(target)) return null;
    const idxStr = target.getAttribute('data-key-index');
    if (idxStr === null) return null;
    const idx = parseInt(idxStr, 10);
    if (Number.isNaN(idx)) return null;
    return visibleMidiForIndex[idx] ?? null;
  };

  // ---- Mouse handlers ----
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only
    const midi = hitTest(e.clientX, e.clientY);
    if (midi === null) return;
    e.preventDefault();
    mouseDragActive.current = true;
    mouseCurrentMidi.current = midi;
    onDragStart?.();
    onNoteOn?.(midi);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseDragActive.current) return;
    const midi = hitTest(e.clientX, e.clientY);
    if (midi === mouseCurrentMidi.current) return;
    if (mouseCurrentMidi.current !== null) {
      onNoteOff?.(mouseCurrentMidi.current);
    }
    mouseCurrentMidi.current = midi;
    if (midi !== null) {
      onNoteOn?.(midi);
    }
  };

  // Global mouseup / cancel handlers (so release fires even off-element).
  useEffect(() => {
    const release = () => {
      if (mouseCurrentMidi.current !== null) {
        onNoteOff?.(mouseCurrentMidi.current);
      }
      mouseDragActive.current = false;
      mouseCurrentMidi.current = null;
    };
    const onWindowMouseUp = () => {
      if (mouseDragActive.current) release();
    };
    const onWindowBlur = () => {
      if (mouseDragActive.current) release();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && mouseDragActive.current) {
        release();
      }
    };
    const onWindowMouseLeave = (e: MouseEvent) => {
      // Mouse left the window
      if (e.relatedTarget === null && mouseDragActive.current) release();
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('mouseleave', onWindowMouseLeave);
    return () => {
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('mouseleave', onWindowMouseLeave);
    };
  }, [onNoteOff]);

  // ---- Touch handlers ----
  const handleTouchStart = (e: React.TouchEvent) => {
    let triggeredDrag = false;
    for (const touch of Array.from(e.changedTouches)) {
      const midi = hitTest(touch.clientX, touch.clientY);
      if (midi === null) {
        touchDragActive.current.set(touch.identifier, false);
        continue;
      }
      touchDragActive.current.set(touch.identifier, true);
      touchCurrentMidi.current.set(touch.identifier, midi);
      if (!triggeredDrag) {
        triggeredDrag = true;
        onDragStart?.();
      }
      onNoteOn?.(midi);
    }
    if (triggeredDrag) e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    for (const touch of Array.from(e.changedTouches)) {
      if (!touchDragActive.current.get(touch.identifier)) continue;
      const midi = hitTest(touch.clientX, touch.clientY);
      const prev = touchCurrentMidi.current.get(touch.identifier) ?? null;
      if (midi === prev) continue;
      if (prev !== null) onNoteOff?.(prev);
      if (midi !== null) {
        onNoteOn?.(midi);
        touchCurrentMidi.current.set(touch.identifier, midi);
      } else {
        touchCurrentMidi.current.delete(touch.identifier);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (const touch of Array.from(e.changedTouches)) {
      const prev = touchCurrentMidi.current.get(touch.identifier);
      if (prev !== undefined) {
        onNoteOff?.(prev);
      }
      touchCurrentMidi.current.delete(touch.identifier);
      touchDragActive.current.delete(touch.identifier);
    }
  };

  // Global touch cancel + visibility/blur for touch
  useEffect(() => {
    const releaseAllTouches = () => {
      for (const [id, midi] of touchCurrentMidi.current) {
        onNoteOff?.(midi);
        void id;
      }
      touchCurrentMidi.current.clear();
      touchDragActive.current.clear();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releaseAllTouches();
    };
    const onBlur = () => releaseAllTouches();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [onNoteOff]);

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewW} ${viewH}`}
      preserveAspectRatio="xMidYMid meet"
      className="piano-roll"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {rendered.children.map((child, i) => {
        if (!child) return null;
        return (
          <polygon
            key={i}
            data-key-index={i}
            points={child.polygon.points}
            fill={child.polygon.style.fill}
            stroke={child.polygon.style.stroke}
            strokeWidth={child.polygon.style.strokeWidth}
          />
        );
      })}
    </svg>
  );
}
