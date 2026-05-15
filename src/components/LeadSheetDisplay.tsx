import type { Exercise, NumeralSystem } from '../music/types';
import { keyDisplayName, renderNumeral } from '../music/numeral';

interface LeadSheetDisplayProps {
  exercise: Exercise;
  numeralSystem: NumeralSystem;
}

export function LeadSheetDisplay({ exercise, numeralSystem }: LeadSheetDisplayProps) {
  const keyLabel = keyDisplayName(exercise.keySignature, exercise.displayMode);
  const numeral = renderNumeral(
    exercise.keySignature,
    exercise.poolEntry,
    exercise.inversion,
    exercise.displayMode,
    numeralSystem,
  );
  return (
    <div className="lead-sheet-display">
      <div className="lead-key-name">{keyLabel}</div>
      <div className="lead-numeral">{numeral}</div>
    </div>
  );
}
