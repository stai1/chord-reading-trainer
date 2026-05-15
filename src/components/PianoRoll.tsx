import { renderSVG } from 'svg-piano';
import { midiToFreqStr } from '../audio/sampler';

interface PianoRollProps {
  /** MIDI numbers to highlight. */
  highlightedMidi: number[];
}

/**
 * 61-key piano roll (C2-C7) using svg-piano. Highlights specified MIDI notes
 * in red. The SVG scales responsively to fill its container's width while
 * preserving aspect ratio.
 */
export function PianoRoll({ highlightedMidi }: PianoRollProps) {
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
      preserveAspectRatio="xMidYMid meet"
      className="piano-roll"
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
