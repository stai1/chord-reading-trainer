import { renderSVG } from 'svg-piano';
import { midiToFreqStr } from '../audio/sampler';

interface PianoRollProps {
  /** MIDI numbers to highlight. */
  highlightedMidi: number[];
  width?: number;
}

/**
 * 61-key piano roll (C2-C7) using svg-piano. Highlights specified MIDI notes
 * in red.
 */
export function PianoRoll({ highlightedMidi, width = 540 }: PianoRollProps) {
  // Convert MIDIs to svg-piano's note strings (e.g. "C4", "D#5").
  const highlightedNames = highlightedMidi.map(midiToFreqStr);

  const rendered = renderSVG({
    range: ['C2', 'C7'],
    colorize: highlightedNames.length
      ? [{ keys: highlightedNames, color: '#d33' }]
      : [],
    upperHeight: 80,
    lowerHeight: 36,
    scaleX: 0.85,
    scaleY: 0.85,
  });

  const viewW = rendered.svg.width;
  const viewH = rendered.svg.height;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={width}
      height={(width * viewH) / viewW}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {rendered.children.map((child, i) => {
        if (!child) return null;
        return (
          <polygon
            key={i}
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
