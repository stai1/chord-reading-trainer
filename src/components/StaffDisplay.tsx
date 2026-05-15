import { useEffect, useRef } from 'react';
import type { Exercise } from '../music/types';
import { renderExercise } from '../music/vexRender';

interface StaffDisplayProps {
  exercise: Exercise;
}

export function StaffDisplay({ exercise }: StaffDisplayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    renderExercise(ref.current, exercise);
  }, [exercise]);

  return <div ref={ref} className="staff-display" />;
}
