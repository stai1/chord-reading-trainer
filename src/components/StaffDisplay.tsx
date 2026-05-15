import { useEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { Exercise } from '../music/types';
import { exerciseToAbc } from '../music/abcRender';

interface StaffDisplayProps {
  exercise: Exercise;
}

/**
 * Renders a staff sight-reading exercise via abcjs. After rendering, the
 * generated SVG's viewBox is trimmed to the bounding box of its actual
 * content so trailing empty staff space is removed.
 */
export function StaffDisplay({ exercise }: StaffDisplayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const abc = exerciseToAbc(exercise);
    abcjs.renderAbc(ref.current, abc, {
      add_classes: true,
      staffwidth: 320,
      scale: 1.2,
      paddingleft: 0,
      paddingright: 0,
      paddingtop: 0,
      paddingbottom: 0,
      responsive: 'resize',
    });
    centerInnerGroup(ref.current);
  }, [exercise]);

  return <div ref={ref} className="staff-display" />;
}

/**
 * Stabilizes the staff display by:
 *   1. Expanding the SVG's viewBox to a fixed target width (in user units),
 *      so all exercises occupy the same pixel width at the same scale.
 *   2. Translating the inner <g> horizontally so its bounding box is centered
 *      within that frame.
 *
 * abcjs's natural SVG width varies per exercise (key-signature width, number
 * of accidentals, etc.). This keeps the rendered scale constant while centering
 * the content within a fixed-width container.
 */
const TARGET_VIEWBOX_WIDTH = 400;

export function centerInnerGroup(container: HTMLElement) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const innerG = svg.querySelector('g');
  if (!innerG) return;
  try {
    const viewBox = svg.viewBox.baseVal;
    if (!viewBox) return;
    const naturalWidth = viewBox.width;
    if (!naturalWidth) return;

    // Expand (or shrink) viewBox to the target width, keeping height and
    // y origin the same. Adjust x so the original content's center stays
    // at the new center.
    const newWidth = Math.max(TARGET_VIEWBOX_WIDTH, naturalWidth);
    const newX = viewBox.x - (newWidth - naturalWidth) / 2;
    svg.setAttribute('viewBox', `${newX} ${viewBox.y} ${newWidth} ${viewBox.height}`);

    // Also resize the rendered pixel width proportionally so abcjs's
    // responsive sizing doesn't squash content. Preserve the height/width ratio.
    const heightAttr = svg.getAttribute('height');
    const widthAttr = svg.getAttribute('width');
    if (widthAttr && heightAttr) {
      const oldW = parseFloat(widthAttr);
      if (!Number.isNaN(oldW) && oldW > 0) {
        const ratio = newWidth / naturalWidth;
        svg.setAttribute('width', String(oldW * ratio));
      }
    }

    // Now center the inner <g> within the new viewBox.
    const bbox = (innerG as SVGGraphicsElement).getBBox();
    const currentCenter = bbox.x + bbox.width / 2;
    const targetCenter = newX + newWidth / 2;
    const dx = targetCenter - currentCenter;
    const existing = innerG.getAttribute('transform') ?? '';
    innerG.setAttribute('transform', `translate(${dx}, 0) ${existing}`.trim());
  } catch {
    // ignore
  }
}
