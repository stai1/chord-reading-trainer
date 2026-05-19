import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  StaveConnector,
  Barline,
  TextBracket,
} from 'vexflow';
import type { Exercise, KeySignature, Note } from './types';
import { noteLetterIndex, accidentalSemitone } from './midi';
import { diatonicAccidentalFor } from './chordToNotes';

/**
 * Threshold for applying 8va to the treble clef: trigger when any treble note's
 * letter position (ignoring accidental) is strictly above the B6 ledger line.
 *
 * Examples that trigger: C7, C♭7 (letter C is above B), C♯7, D7, etc.
 * Examples that don't: B6, B♭6, B♯6 (B♯6 sounds like C7 but its letter is B,
 * which sits on the B6 line, so it's exempt).
 *
 * Letter index of B6 = (6+1)*12 + 11 = 95. We trigger on letter index > 95.
 */
const TREBLE_8VA_THRESHOLD = 95; // B6 letter position

function trebleNeeds8va(notes: Note[]): boolean {
  for (const n of notes) {
    if (noteLetterIndex(n, 0) > TREBLE_8VA_THRESHOLD) return true;
  }
  return false;
}

/** Returns the notes shifted down an octave (for 8va rendering). */
function lowerNotesAnOctave(notes: Note[]): Note[] {
  return notes.map((n) => ({ ...n, octave: n.octave - 1 }));
}

/**
 * Map our drawn accidental enum to VexFlow's accidental string.
 * VexFlow expects "n" for natural, "b" for flat, "#" for sharp,
 * "bb" / "##" for doubles.
 */
function vexAccidental(note: Note): string | null {
  switch (note.accidental) {
    case 'double-flat': return 'bb';
    case 'flat': return 'b';
    case 'natural': return 'n';
    case 'sharp': return '#';
    case 'double-sharp': return '##';
    case null: return null;
    default: return null;
  }
}

/**
 * VexFlow's "key" syntax for StaveNote is "<letter><accidental>/<octave>".
 * We always render with accidentals applied at the Accidental modifier level,
 * but the note's pitch reference still needs the accidental in the key string
 * if we want VexFlow to vertical-position correctly. We use the natural letter
 * and let Accidental modifier handle the visible glyph.
 *
 * The pitch key just needs letter and octave: "C/4", "B/5". VexFlow will
 * vertically place by the letter alone in the key signature context, then
 * draw the accidental modifier explicitly.
 */
function vexNoteKey(note: Note): string {
  return `${note.letter.toLowerCase()}/${note.octave}`;
}

/** VexFlow key signature spec. */
function vexKey(key: KeySignature): string {
  return key.majorTonic.replace('♭', 'b').replace('♯', '#');
}

/**
 * Returns true if the note's accidental matches what the key signature already
 * provides for that letter — in which case no accidental glyph should be drawn
 * (the key signature handles it). E.g., F♯ in G major is diatonic; no glyph.
 *
 * - accidental: null is treated as 0 (natural drawn), which is diatonic only
 *   when the key signature also has 0 for that letter; otherwise an explicit
 *   natural sign is required.
 */
function isDiatonic(note: Note, key: KeySignature): boolean {
  const noteDelta = accidentalSemitone(note.accidental);
  const keyDelta = diatonicAccidentalFor(note.letter, key);
  return noteDelta === keyDelta;
}

/**
 * Build a StaveNote (chord) for a list of notes on a given clef.
 * Notes are sorted ascending by pitch. Whole-note duration ("w").
 * If notes is empty, returns a whole rest.
 *
 * Per-note accidental glyphs are drawn only for notes that *aren't* diatonic
 * to the active key signature; diatonic alterations are conveyed by the key
 * signature itself, so adding an accidental modifier would be redundant.
 * Natural signs are drawn when the letter is altered by the key signature
 * but the note's pitch is the plain natural letter (so the player knows to
 * override the key signature).
 */
function buildStaveNote(
  notes: Note[],
  clef: 'treble' | 'bass',
  key: KeySignature,
): StaveNote {
  if (notes.length === 0) {
    return new StaveNote({
      keys: [clef === 'treble' ? 'b/4' : 'd/3'],
      duration: 'wr',
      clef,
    });
  }

  // Sort ascending by absolute pitch (octave first, then letter).
  const LETTER_INDEX: Record<string, number> = {
    C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
  };
  const sorted = [...notes].sort((a, b) => {
    if (a.octave !== b.octave) return a.octave - b.octave;
    return (LETTER_INDEX[a.letter] ?? 0) - (LETTER_INDEX[b.letter] ?? 0);
  });

  const keys = sorted.map(vexNoteKey);
  const sn = new StaveNote({
    keys,
    duration: 'w',
    clef,
  });

  // Attach accidentals only where the note differs from the key signature.
  sorted.forEach((n, i) => {
    if (isDiatonic(n, key)) return;
    // For notes whose drawn-accidental field is `null` but which need to be
    // overridden from the key sig (i.e., letter is sharped/flatted in the
    // key sig but we want the natural), force a natural glyph.
    let glyph = vexAccidental(n);
    if (glyph === null) glyph = 'n';
    sn.addModifier(new Accidental(glyph), i);
  });

  return sn;
}

/** Fixed pixel dimensions of the rendered grand staff. */
const STAFF_WIDTH = 320;
const STAFF_HEIGHT = 270;

/** Vertical positions for the treble and bass staves within the SVG. */
const TREBLE_Y = 40;
const BASS_Y = 140;

/**
 * Render a staff sight-reading exercise into the given container as a grand
 * staff (treble + bass with a brace). Pixel dimensions are fixed regardless
 * of content complexity, so renders stay visually stable across exercises.
 */
export function renderExercise(
  container: HTMLDivElement,
  exercise: Exercise,
): void {
  if (exercise.exerciseType !== 'staff') {
    throw new Error('renderExercise only handles staff exercises');
  }

  const width = STAFF_WIDTH;
  const height = STAFF_HEIGHT;

  // Clear container
  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  // Stave positions: x = left margin (room for brace), y from module constants.
  const LEFT_MARGIN = 24;
  const STAVE_WIDTH = width - LEFT_MARGIN - 12;

  const keyStr = vexKey(exercise.keySignature);

  const trebleStave = new Stave(LEFT_MARGIN, TREBLE_Y, STAVE_WIDTH);
  trebleStave.addClef('treble').addKeySignature(keyStr);
  trebleStave.setEndBarType(Barline.type.SINGLE);
  trebleStave.setContext(ctx).draw();

  const bassStave = new Stave(LEFT_MARGIN, BASS_Y, STAVE_WIDTH);
  bassStave.addClef('bass').addKeySignature(keyStr);
  bassStave.setEndBarType(Barline.type.SINGLE);
  bassStave.setContext(ctx).draw();

  // Connect the two staves with a brace + single line at the start.
  const brace = new StaveConnector(trebleStave, bassStave);
  brace.setType(StaveConnector.type.BRACE);
  brace.setContext(ctx).draw();

  const lineConnector = new StaveConnector(trebleStave, bassStave);
  lineConnector.setType(StaveConnector.type.SINGLE_LEFT);
  lineConnector.setContext(ctx).draw();

  const rightConnector = new StaveConnector(trebleStave, bassStave);
  rightConnector.setType(StaveConnector.type.SINGLE_RIGHT);
  rightConnector.setContext(ctx).draw();

  // Determine note placement on each clef.
  const clef = exercise.clef;
  let trebleNotes: Note[] = [];
  let bassNotes: Note[] = [];

  if (clef === 'both') {
    trebleNotes = exercise.trebleNotes ?? [];
    bassNotes = exercise.bassNotes ?? [];
  } else if (clef === 'treble') {
    trebleNotes = exercise.notes;
  } else {
    bassNotes = exercise.notes;
  }

  // If the treble notes extend above the B6 ledger line, lower them an octave
  // and mark for 8va bracket rendering.
  const trebleEightVa = trebleNotes.length > 0 && trebleNeeds8va(trebleNotes);
  const trebleNotesDisplay = trebleEightVa ? lowerNotesAnOctave(trebleNotes) : trebleNotes;

  const trebleStaveNote = buildStaveNote(trebleNotesDisplay, 'treble', exercise.keySignature);
  const bassStaveNote = buildStaveNote(bassNotes, 'bass', exercise.keySignature);

  const trebleVoice = new Voice({ numBeats: 4, beatValue: 4 });
  trebleVoice.setMode(Voice.Mode.SOFT);
  trebleVoice.addTickables([trebleStaveNote]);

  const bassVoice = new Voice({ numBeats: 4, beatValue: 4 });
  bassVoice.setMode(Voice.Mode.SOFT);
  bassVoice.addTickables([bassStaveNote]);

  const formatter = new Formatter();
  formatter.joinVoices([trebleVoice]);
  formatter.joinVoices([bassVoice]);

  formatter.format([trebleVoice, bassVoice], STAVE_WIDTH - 80);

  // Center the chords between the right edge of the key signature and the
  // right barline, taking into account the wider of the two chords' full
  // visual widths. We apply the SAME shift to both staves and to every
  // element on each chord (head + all modifiers), so their pre-shift
  // alignment is preserved — both clefs' noteheads stay vertically aligned.
  //
  // VexFlow quirk: Modifier.setXShift has an asymmetric sign convention. For
  // LEFT-positioned modifiers (accidentals), the internal offset is negated:
  // setXShift(t) sets internal xShift = -t. So passing -shift to a left
  // modifier yields the same screen-space displacement as setXShift(shift)
  // on the note itself.
  const NOTE_AREA_END_PADDING = 12;
  const trebleWidth = trebleStaveNote.getMetrics().width;
  const bassWidth = bassStaveNote.getMetrics().width;
  const maxChordWidth = Math.max(trebleWidth, bassWidth);
  const naturalStart = trebleStave.getNoteStartX();
  const rightLimit = trebleStave.getNoteEndX() - NOTE_AREA_END_PADDING;
  const availableWidth = rightLimit - naturalStart;
  const shift = Math.max(0, (availableWidth - maxChordWidth) / 2);
  if (shift > 0) {
    for (const note of [trebleStaveNote, bassStaveNote]) {
      note.setXShift(shift);
      for (const mod of note.getModifiers()) {
        mod.setXShift(-shift);
      }
    }
  }

  trebleVoice.draw(ctx, trebleStave);
  bassVoice.draw(ctx, bassStave);

  // 8va bracket above the treble chord, if applicable.
  if (trebleEightVa) {
    const bracket = new TextBracket({
      start: trebleStaveNote,
      stop: trebleStaveNote,
      text: '8',
      superscript: 'va',
      position: TextBracket.Position.TOP,
    });
    bracket.setContext(ctx).draw();
  }
}

/**
 * Render an empty grand staff with key signature only (used for set boundary
 * cues).
 */
export function renderEmptyStaff(
  container: HTMLDivElement,
  key: KeySignature,
): void {
  const width = STAFF_WIDTH;
  const height = STAFF_HEIGHT;

  container.innerHTML = '';

  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const LEFT_MARGIN = 24;
  const STAVE_WIDTH = width - LEFT_MARGIN - 12;

  const keyStr = vexKey(key);

  const trebleStave = new Stave(LEFT_MARGIN, TREBLE_Y, STAVE_WIDTH);
  trebleStave.addClef('treble').addKeySignature(keyStr);
  trebleStave.setEndBarType(Barline.type.SINGLE);
  trebleStave.setContext(ctx).draw();

  const bassStave = new Stave(LEFT_MARGIN, BASS_Y, STAVE_WIDTH);
  bassStave.addClef('bass').addKeySignature(keyStr);
  bassStave.setEndBarType(Barline.type.SINGLE);
  bassStave.setContext(ctx).draw();

  const brace = new StaveConnector(trebleStave, bassStave);
  brace.setType(StaveConnector.type.BRACE);
  brace.setContext(ctx).draw();

  const lineConnector = new StaveConnector(trebleStave, bassStave);
  lineConnector.setType(StaveConnector.type.SINGLE_LEFT);
  lineConnector.setContext(ctx).draw();

  const rightConnector = new StaveConnector(trebleStave, bassStave);
  rightConnector.setType(StaveConnector.type.SINGLE_RIGHT);
  rightConnector.setContext(ctx).draw();
}
