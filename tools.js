/* The three free tools: transpose, capo, Nashville numbers.

   Everything here is arithmetic on note names. Nothing is sent anywhere,
   nothing is stored, and there is no network call in any of it — the chart
   you paste never leaves the page. (The two anonymous counters at the bottom
   of this file do speak to the server. They carry a step name and the arrival
   code from the link you came in on, and nothing about your chart.)

   It is a port of the Dart the app already runs, and the port is deliberate
   rather than a rewrite: the same tables, the same rules, the same edge cases
   the app got wrong once and fixed. The originals are

     lib/services/music_reference.dart   — transpose, spelling, capos, degrees
     lib/services/chord_names.dart       — Harte notation into what people write
     lib/services/number_reading.dart    — which note a minor song counts from
     lib/services/shape_reading.dart     — guitar and ukulele
     lib/services/brought_chart.dart     — reading a chart somebody pasted
     lib/features/workspace/musician_sheet_logic.dart — chordAsPlayed, capoLine

   and the cases that made those rules are in tools.test.js, carried across
   from the app's own tests so the two cannot drift.

   An ES module, so `deno test` can import the arithmetic and the pages can
   load the same file with <script type="module">. No framework, no build
   step, no dependency. */

/* ==================================================================
   Note names and keys
   ================================================================== */

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const PITCH = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
};

/** The pitch class of a note name, 0 for C up to 11 for B, or null. */
export function pitchOf(note) {
  const found = PITCH[note];
  return found === undefined ? null : found;
}

export function noteName(pitch, flats) {
  const index = ((pitch % 12) + 12) % 12;
  return flats ? FLAT_NAMES[index] : SHARP_NAMES[index];
}

/** The pitch class a key counts from, or null when it is not a key. */
export function keyRootPitch(key) {
  if (key === null || key === undefined) return null;
  const match = /^([A-G][#b]?)/.exec(String(key).trim());
  return match === null ? null : pitchOf(match[1]);
}

/** A minor key by the mode written after its root: "A minor", "Am", "A min". */
export function keyIsMinor(key) {
  if (key === null || key === undefined) return false;
  const match = /^([A-G][#b]?)\s*(.*)$/.exec(String(key).trim());
  if (match === null) return false;
  const rest = match[2].toLowerCase();
  return rest.startsWith('min') || rest === 'm' || rest.startsWith('aeolian');
}

const FLAT_MAJORS = new Set([5, 10, 3, 8, 1]);
const FLAT_MINORS = new Set([2, 7, 0, 5, 10]);

/** The flats rule asked of a root that has no name yet. */
export function pitchUsesFlats(pitch, minor) {
  const root = ((pitch % 12) + 12) % 12;
  return minor ? FLAT_MINORS.has(root) : FLAT_MAJORS.has(root);
}

/* F, B♭, E♭, A♭ and D♭ major; D, G, C, F and B♭ minor. Decided by pitch and
   not by how the key arrived, because the analyser names every key with
   sharps and "A# major" is B♭ major. The six-accidental keys stay sharp
   (F♯ major, D♯ minor), which is how they are usually written. */
export function keyUsesFlats(key) {
  const pitch = keyRootPitch(key);
  if (pitch === null) return false;
  return pitchUsesFlats(pitch, keyIsMinor(key));
}

/* Semitones from one key up to another, 0 to 11.

   Between two keys in the same mode it is the distance between their roots.
   Between a major key and a minor one no transposition exists, so the second
   key is read as the band naming the same chords another way: a minor key
   counts from its relative major, so A minor to C major moves nothing. The
   one exception is the parallel — A major over a song called A minor is
   correcting the mode, not asking for the chords nine semitones away. */
export function semitonesBetweenKeys(from, to) {
  const pa = keyRootPitch(from);
  const pb = keyRootPitch(to);
  if (pa === null || pb === null) return 0;
  const fromMinor = keyIsMinor(from);
  const toMinor = keyIsMinor(to);
  if (fromMinor === toMinor || pa === pb) return (((pb - pa) % 12) + 12) % 12;
  const fromMajor = fromMinor ? pa + 3 : pa;
  const toMajor = toMinor ? pb + 3 : pb;
  return (((toMajor - fromMajor) % 12) + 12) % 12;
}

/* ==================================================================
   Chords: what they are made of, and how they are written
   ================================================================== */

const QUALITIES = {
  maj: { name: 'Major', intervals: [0, 4, 7], family: 'maj' },
  min: { name: 'Minor', intervals: [0, 3, 7], family: 'min' },
  dim: { name: 'Diminished', intervals: [0, 3, 6], family: null },
  aug: { name: 'Augmented', intervals: [0, 4, 8], family: null },
  '7': { name: 'Dominant 7th', intervals: [0, 4, 7, 10], family: '7' },
  maj7: { name: 'Major 7th', intervals: [0, 4, 7, 11], family: 'maj7' },
  min7: { name: 'Minor 7th', intervals: [0, 3, 7, 10], family: 'min7' },
  dim7: { name: 'Diminished 7th', intervals: [0, 3, 6, 9], family: null },
  hdim7: { name: 'Half-diminished', intervals: [0, 3, 6, 10], family: null },
  maj6: { name: 'Major 6th', intervals: [0, 4, 7, 9], family: null },
  min6: { name: 'Minor 6th', intervals: [0, 3, 7, 9], family: null },
  sus2: { name: 'Suspended 2nd', intervals: [0, 2, 7], family: null },
  sus4: { name: 'Suspended 4th', intervals: [0, 5, 7], family: null },
  '7sus4': { name: 'Dominant 7th suspended 4th', intervals: [0, 5, 7, 10], family: null },
  '5': { name: 'Fifth', intervals: [0, 7], family: '5' },
  add9: { name: 'Added 9th', intervals: [0, 4, 7, 14], family: null },
  '9': { name: 'Dominant 9th', intervals: [0, 4, 7, 10, 14], family: '7' },
  min9: { name: 'Minor 9th', intervals: [0, 3, 7, 10, 14], family: 'min7' },
  maj9: { name: 'Major 9th', intervals: [0, 4, 7, 11, 14], family: 'maj7' },
  '11': { name: 'Dominant 11th', intervals: [0, 4, 7, 10, 14, 17], family: '7' },
  '13': { name: 'Dominant 13th', intervals: [0, 4, 7, 10, 14, 21], family: '7' },
};

/* Both spellings reach the same chord: the analyser writes Harte (`A:min7`),
   a person editing a chart writes `Am7`. */
const WRITTEN_SUFFIXES = {
  '': 'maj', maj: 'maj', M: 'maj',
  m: 'min', min: 'min', '-': 'min',
  dim: 'dim', o: 'dim', '°': 'dim',
  aug: 'aug', '+': 'aug',
  '7': '7',
  maj7: 'maj7', M7: 'maj7', 'Δ7': 'maj7',
  m7: 'min7', min7: 'min7', '-7': 'min7',
  dim7: 'dim7', '°7': 'dim7',
  m7b5: 'hdim7', 'm7♭5': 'hdim7', 'ø': 'hdim7',
  '6': 'maj6', maj6: 'maj6',
  m6: 'min6', min6: 'min6',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  '7sus4': '7sus4', '7sus': '7sus4',
  '5': '5',
  add9: 'add9', add2: 'add9',
  '9': '9', m9: 'min9', min9: 'min9', maj9: 'maj9', M9: 'maj9',
  '11': '11', '13': '13',
};

/** The house spelling of a quality — what the app draws on a chart. */
const SHORT_FORMS = {
  maj: '', min: 'm', '7': '7', maj7: 'maj7', min7: 'm7',
  dim: '°', aug: '+', dim7: '°7', hdim7: 'm7♭5',
  maj6: '6', min6: 'm6', sus2: 'sus2', sus4: 'sus4',
  '7sus4': '7sus4', '5': '5',
  add9: 'add9', '9': '9', min9: 'm9', maj9: 'maj9',
  '11': '11', '13': '13',
};

/* Suffixes a chord is written with on a chart somebody brought. A recognition
   table rather than an interpretation one — a suffix nothing knows how to
   voice is still a suffix somebody wrote down.

   The lower-case `o` for a diminished chord is deliberately left out. It is
   real notation, and it also turns "Do", "Go" and "Co" into chords, so a line
   of short words would be read as a chord line — the one mistake a chart
   reader must not make. */
const CHART_SUFFIXES = new Set([
  '', 'maj', 'M', 'm', 'min', '-',
  'dim', '°', 'aug', '+',
  '7', 'maj7', 'M7', 'Δ7', 'Δ', 'm7', 'min7', '-7',
  'dim7', '°7', 'm7b5', 'm7♭5', 'ø', 'ø7',
  '6', 'maj6', 'm6', 'min6', '6/9', '69',
  'sus', 'sus2', 'sus4', '7sus4', '7sus', '9sus4', 'sus4add9',
  // How a worship chart writes sus2 and sus4. Admitted because there is no
  // line of words in which "C2" or "D4" is a word.
  '2', '4',
  '5',
  'add9', 'add2', 'add4', 'add11', 'madd9',
  '9', 'm9', 'min9', 'maj9', 'M9',
  '11', 'm11', '13', 'm13', 'maj11', 'maj13',
  '7b5', '7#5', '7b9', '7#9', '9#11', '13b9',
  'mmaj7', 'mMaj7', 'minmaj7',
]);

/** Whether a token is written the way a chord is written on paper.
 *
 * Strict on purpose, and the reason a chart reader can tell a line of chords
 * from a line of words: "A" is a chord and so are "Am7" and "G/B", while "I",
 * "the" and "Oh" are not — so "Am I the only one" is a lyric and "Am  C  G"
 * is not. Harte is refused, because nobody writes it on a chart.
 */
export function isChordName(token) {
  let raw = String(token).trim();
  if (raw === '' || raw.includes(':')) return false;
  const slash = raw.lastIndexOf('/');
  if (slash > 0 && PITCH[raw.substring(slash + 1)] !== undefined) {
    raw = raw.substring(0, slash);
  }
  const match = /^([A-G][#b]?)(.*)$/.exec(raw);
  if (match === null) return false;
  return CHART_SUFFIXES.has(match[2]);
}

function moveNote(note, semitones) {
  const pitch = pitchOf(note);
  if (pitch === null) return null;
  return noteName(pitch + semitones, false);
}

/** A chord moved by [semitones]: the root, and the bass under it.
 *
 * It used to move only the root, so "G/B" up two came out "A/B" — a different
 * chord with the wrong note in the bass player's hand. Only a bass written as
 * a note moves: Harte writes the bass as a degree of the chord ("G:maj/3"),
 * and a degree counts from the root, so moving the root has already moved it.
 * "C6/9" is a quality with a slash in it, not a bass, and stays as written.
 *
 * Names come out sharp. Spelling them the way the new key writes them is
 * [spellInKey]'s job.
 */
export function transposeChord(chord, semitones) {
  if (semitones % 12 === 0) return chord;
  const match = /^([A-G][#b]?)(.*)$/.exec(String(chord).trim());
  if (match === null) return chord;
  const root = moveNote(match[1], semitones);
  if (root === null) return chord;
  let rest = match[2];
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    const bass = moveNote(rest.substring(slash + 1), semitones);
    if (bass !== null) rest = rest.substring(0, slash + 1) + bass;
  }
  return root + rest;
}

/* How far up the alphabet a chord tone is written from the root: a third is
   two letters up, a fifth four, a seventh six. Flattened or sharpened, a
   third is still a third — the flat fifth of a diminished chord is a G of
   some kind over a C, never an F♯. */
const CHORD_TONE_LETTERS = { 3: 2, 4: 2, 6: 4, 7: 4, 8: 4, 10: 6, 11: 6 };
const LETTERS = 'CDEFGAB';
const LETTER_PITCHES = [0, 2, 4, 5, 7, 9, 11];

function flattenSharps(written, leadingTone) {
  return written.replace(/([A-G])#/g, (whole, letter) => {
    const pitch = PITCH[letter + '#'];
    if (pitch === undefined || pitch === leadingTone) return whole;
    return FLAT_NAMES[pitch];
  });
}

/* The bass of a slash chord spelled as the chord tone it is, or null when it
   is not a third, fifth or seventh of the chord and the key should spell it. */
function bassAsChordTone(chord, bass) {
  const bassPitch = PITCH[bass.trim()];
  const match = /^([A-G][#b]?)(.*)$/.exec(chord.trim());
  if (bassPitch === undefined || match === null) return null;
  const root = match[1];
  const rootPitch = PITCH[root];
  if (rootPitch === undefined) return null;
  const suffix = match[2];
  const quality = QUALITIES[WRITTEN_SUFFIXES[suffix] ?? suffix];
  if (quality === undefined) return null;

  const interval = (bassPitch - rootPitch + 12) % 12;
  const letters = CHORD_TONE_LETTERS[interval];
  if (letters === undefined) return null;
  if (!quality.intervals.some((tone) => tone % 12 === interval)) return null;

  const letter = (LETTERS.indexOf(root[0]) + letters) % 7;
  const shift = ((bassPitch - LETTER_PITCHES[letter] + 18) % 12) - 6;
  // A double flat is correct arithmetic and no help on a music stand — the
  // diminished seventh of C is a B double-flat — so those fall back to the
  // key rule and its plain A.
  if (shift < -1 || shift > 1) return null;
  return LETTERS[letter] + (shift === 1 ? '#' : shift === -1 ? 'b' : '');
}

/** A chord or a key written the way its key writes it: B♭ rather than A♯.
 *
 * Only sharps are respelled, so a name somebody wrote with flats stays as
 * they wrote it. A minor key keeps its raised seventh sharp — the C♯ of an A7
 * in D minor is a C♯ — because that is the one sharp a flat minor key has.
 *
 * A slash chord's sharp bass is spelled from the chord it belongs to when it
 * is one of that chord's own notes. The key rule on its own read D/F♯ in D
 * minor as D/G♭, and that F♯ is the major third of D: a third is two letters
 * up from the root whatever the key is doing.
 */
export function spellInKey(written, key) {
  if (!keyUsesFlats(key)) return written;
  const trimmedKey = String(key).trim();
  const tonic = /^([A-G][#b]?)/.exec(trimmedKey)?.[1] ?? null;
  const tonicPitch = tonic === null ? null : PITCH[tonic] ?? null;
  const rest = trimmedKey.substring(tonic === null ? 0 : tonic.length).trim().toLowerCase();
  const minor = rest.startsWith('min') || rest === 'm' || rest.startsWith('aeolian');
  const leadingTone = minor && tonicPitch !== null ? (tonicPitch + 11) % 12 : null;

  const slash = written.lastIndexOf('/');
  if (slash > 0 && written.substring(slash + 1).includes('#')) {
    // The root is spelled in the key first, because the bass is then counted
    // in letters from whatever the root ended up being called.
    const chord = flattenSharps(written.substring(0, slash), leadingTone);
    const bass = bassAsChordTone(chord, written.substring(slash + 1));
    if (bass !== null) return chord + '/' + bass;
  }
  return flattenSharps(written, leadingTone);
}

/* ------------------------------------------------------------------
   Harte notation into what a musician writes (chord_names.dart).

   The analysis reports "C:maj", "A:min", "G:7". Nobody writes those on a
   chart, and a chart nobody can read is a chart nobody uses.
   ------------------------------------------------------------------ */

const HARTE_QUALITIES = {
  maj: '', min: 'm', dim: '°', aug: '+',
  '7': '7', maj7: 'maj7', min7: 'm7', dim7: '°7', hdim7: 'm7♭5',
  minmaj7: 'mMaj7', maj6: '6', min6: 'm6', '6': '6',
  '9': '9', maj9: 'maj9', min9: 'm9', '11': '11', '13': '13',
  sus2: 'sus2', sus4: 'sus4',
};

/* Harte writes the bass of an inversion as a scale degree relative to the
   root — `C:maj/5` is a C chord over G. A degree is meaningless to read at
   speed, and it is the bass player's line, so it is resolved to a note. */
const DEGREE_SEMITONES = {
  '1': 0,
  b2: 1, '2': 2, '#2': 3,
  b3: 3, '3': 4,
  '4': 5, '#4': 6,
  b5: 6, '5': 7, '#5': 8,
  b6: 8, '6': 9,
  b7: 10, '7': 11,
  b9: 1, '9': 2,
  '11': 5, '#11': 6,
  '13': 9,
};

/** A chord label as it should appear to a musician.
 *
 * Anything without a colon is passed through untouched. Chords a person typed
 * by hand are already written the way they want them, and this must never
 * "correct" somebody's own spelling.
 */
export function chordDisplay(label) {
  const raw = String(label).trim();
  if (raw === '' || raw === 'N' || raw === 'X') return '';
  const colon = raw.indexOf(':');
  if (colon <= 0) return raw;

  const root = raw.substring(0, colon);
  let quality = raw.substring(colon + 1);
  let bass = '';
  const slash = quality.indexOf('/');
  if (slash >= 0) {
    bass = quality.substring(slash + 1);
    quality = quality.substring(0, slash);
  }
  // An unrecognised quality is kept verbatim: showing "C:9(11)" is ugly,
  // showing "C" would be a different chord.
  const written = HARTE_QUALITIES[quality] ?? quality;
  return root + written + bassSuffix(root, bass);
}

function bassSuffix(root, bass) {
  if (bass === '') return '';
  if (PITCH[bass] !== undefined) return '/' + bass;
  const degree = DEGREE_SEMITONES[bass];
  const rootValue = PITCH[root];
  if (degree === undefined || rootValue === undefined) return '/' + bass;
  return '/' + SHARP_NAMES[(rootValue + degree) % 12];
}

/** A chord as it is read off the page: moved into the key somebody is playing
 * in, written the way a musician writes it rather than in Harte, and spelled
 * the way that key spells it — Bb/D in B-flat, not A#/D.
 *
 * [key] is the song's key before transposing.
 */
export function chordAsPlayed(chord, transpose, key) {
  return spellInKey(
    chordDisplay(transposeChord(chord, transpose)),
    key === null || key === undefined ? null : transposeChord(key, transpose),
  );
}

/** The song's key, moved and spelled the same way as its chords. */
export function keyAsPlayed(key, transpose) {
  const moved = transposeChord(key, transpose);
  return spellInKey(moved, moved);
}

/** The line a capo puts under the key: "Capo 4 · G shapes · sounds in B".
 *
 * A capo does not change what the band hears, it changes where the hand goes
 * — so both keys are named: the shapes because they are what is printed in
 * front of the player, and the sounding key because that is what they say out
 * loud to everybody else.
 */
export function capoLine(key, capo, transpose) {
  const sounds = keyAsPlayed(key, transpose);
  if (capo <= 0) return sounds;
  return 'Capo ' + capo + ' · ' + keyAsPlayed(key, transpose - capo) +
    ' shapes · sounds in ' + sounds;
}

/* A chord label pulled apart into root, quality id and bass. Both spellings
   go through here — the analysis's `A:min7` and a person's `Am7`. */
function chordParts(label) {
  const raw = String(label).trim();
  if (raw === '' || raw === 'N' || raw === 'X') return null;

  let rootText;
  let qualityToken;
  let bassToken;

  const colon = raw.indexOf(':');
  if (colon > 0) {
    rootText = raw.substring(0, colon);
    let rest = raw.substring(colon + 1);
    const slash = rest.indexOf('/');
    bassToken = slash >= 0 ? rest.substring(slash + 1) : '';
    if (slash >= 0) rest = rest.substring(0, slash);
    qualityToken = rest;
  } else {
    const match = /^([A-G][#b]?)(.*)$/.exec(raw);
    if (match === null) return null;
    rootText = match[1];
    let rest = match[2];
    const slash = rest.indexOf('/');
    bassToken = slash >= 0 ? rest.substring(slash + 1) : '';
    if (slash >= 0) rest = rest.substring(0, slash);
    qualityToken = WRITTEN_SUFFIXES[rest] ?? rest;
  }
  if (PITCH[rootText] === undefined) return null;
  return { root: rootText, quality: qualityToken, bass: bassToken };
}

/* ==================================================================
   Numbers: the degree a chord is, and the chord a degree is
   ================================================================== */

/* Where a degree sits, as (the number, the accidental in front of it).

   The seven naturals are the major scale, and the five in between are named
   the way a chart names them: ♭3 and ♭7 rather than ♯2 and ♯6, because those
   are the borrowed chords people actually write, and ♯4 rather than ♭5
   because the tritone chord on a chart is the one going up to the 5. */
const DEGREE_NUMBERS = [
  ['1', ''], ['2', '♭'], ['2', ''], ['3', '♭'], ['3', ''], ['4', ''],
  ['4', '♯'], ['5', ''], ['6', '♭'], ['6', ''], ['7', '♭'], ['7', ''],
];

/* The same twelve counted against the natural minor scale, which is how a
   harmony class numbers a minor key: the chords of the key carry no
   accidental, and only what comes from outside it does. */
const MINOR_DEGREE_NUMBERS = [
  ['1', ''], ['2', '♭'], ['2', ''], ['3', ''], ['3', '♯'], ['4', ''],
  ['4', '♯'], ['5', ''], ['6', ''], ['6', '♯'], ['7', ''], ['7', '♯'],
];

/** Where the natural degrees sit in each scale, for reading a number back. */
const MAJOR_STEP_OF = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
const MINOR_STEP_OF = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10 };

const DIMINISHED_QUALITY_IDS = new Set(['dim', 'dim7', 'hdim7']);

const ROMAN_NUMERALS = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII' };

/* A quality written after a number, Nashville style: minor is a dash, because
   an "m" beside a number reads as a word. */
const NASHVILLE_SUFFIXES = {
  maj: '', min: '-', dim: '°', aug: '+',
  '7': '7', maj7: 'maj7', min7: '-7', dim7: '°7', hdim7: '-7♭5',
  maj6: '6', min6: '-6', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  '7sus4': '7sus4', '5': '5',
  '9': '9', min9: '-9', maj9: 'maj9', '11': '11', '13': '13',
};

/* The same qualities after a Roman numeral, where minor is already said by
   the lower case — ii, not ii-. */
const ROMAN_SUFFIXES = {
  maj: '', min: '', dim: '°', aug: '+',
  '7': '7', maj7: 'maj7', min7: '7', dim7: '°7', hdim7: 'ø7',
  maj6: '6', min6: '6', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  '7sus4': '7sus4', '5': '5',
  '9': '9', min9: '9', maj9: 'maj9', '11': '11', '13': '13',
};

/** Qualities whose numeral is written in lower case: the ones with a minor
 * third in them. */
const MINOR_QUALITY_IDS = new Set(['min', 'min7', 'min6', 'min9', 'dim', 'dim7', 'hdim7']);

/** A chord written as its degree of a key: `1`, `4`, `5`, `2-`, `5/7` in
 * Nashville numbers, or `I`, `IV`, `V`, `ii` in Roman numerals.
 *
 * Numbers are the reason Nashville charts survive a singer changing key: the
 * band drops the song a tone and the chart does not change a mark. So this
 * takes the song's own key and the chord as written, and there is nowhere in
 * it for a transpose to get in.
 *
 * `fromMinorTonic` picks the Nashville convention for a minor key. It is a
 * Nashville question only: Roman numerals count a minor key from its own
 * tonic against its own scale, which is what a theory class writes.
 *
 * Returns null when the chord or the key is not something this can read,
 * which is a caller's cue to fall back to letters rather than print a guess.
 */
export function chordAsDegree(written, key, options = {}) {
  const roman = options.roman === true;
  const fromMinorTonic = options.fromMinorTonic === true;

  const keyMatch = /^([A-G][#b]?)\s*(.*)$/.exec(String(key).trim());
  if (keyMatch === null) return null;
  const tonicPitch = PITCH[keyMatch[1]];
  if (tonicPitch === undefined) return null;
  const rest = keyMatch[2].toLowerCase();
  const minor = rest.startsWith('min') || rest === 'm' || rest.startsWith('aeolian');
  // A minor song counted from its relative major is counted from three
  // semitones up: A minor against C, so the home chord is the 6. Only in
  // Nashville numbers, which is the only system that has the choice.
  const relative = minor && !roman && !fromMinorTonic;
  const counted = relative ? tonicPitch + 3 : tonicPitch;
  const minorScale = minor && roman;

  const raw = String(written).trim();
  if (raw === '' || raw === 'N' || raw === 'X') return null;
  const match = /^([A-G][#b]?)(.*)$/.exec(raw);
  if (match === null) return null;
  const rootPitch = PITCH[match[1]];
  if (rootPitch === undefined) return null;

  let suffix = match[2];
  let bass = null;
  const slash = suffix.lastIndexOf('/');
  if (slash >= 0) {
    bass = suffix.substring(slash + 1).trim();
    suffix = suffix.substring(0, slash);
  }

  const qualityId = WRITTEN_SUFFIXES[suffix];
  const head = degreeText(rootPitch - counted, roman, minorScale, qualityId);
  // A quality nobody has a spelling for is carried through as the person
  // wrote it. Dropping it would print a different chord.
  const tail = qualityId === undefined
    ? suffix
    : (roman ? ROMAN_SUFFIXES : NASHVILLE_SUFFIXES)[qualityId] ?? suffix;

  const bassPitch = bass === null || bass === '' ? undefined : PITCH[bass];
  // The bass is a plain number in both readings, never a second numeral: the
  // bass of a slash chord is a note of the key, not a chord of its own, and
  // "5/7" is how a chart writes a V with the leading tone under it.
  const under = bassPitch === undefined
    ? (bass === null || bass === '' ? '' : '/' + bass)
    : '/' + degreeText(bassPitch - counted, false, minorScale, undefined);

  return head + tail + under;
}

/* One degree, as a number or a numeral with its accidental in front. */
function degreeText(fromTonic, roman, minorScale, qualityId) {
  const step = ((fromTonic % 12) + 12) % 12;
  const [number, marked] = (minorScale ? MINOR_DEGREE_NUMBERS : DEGREE_NUMBERS)[step];
  // The leading-tone chord of a minor key is written vii°, not ♯vii°: the
  // harmonic minor's raised 7 is assumed the way every textbook assumes it.
  // Anything else on that note keeps its sharp, so it cannot be misread as
  // the key's own VII a semitone below.
  const leadingTone = minorScale && step === 11 && qualityId !== undefined &&
    DIMINISHED_QUALITY_IDS.has(qualityId);
  const accidental = leadingTone ? '' : marked;
  if (!roman) return accidental + number;
  const numeral = ROMAN_NUMERALS[number];
  const lower = qualityId !== undefined && MINOR_QUALITY_IDS.has(qualityId);
  return accidental + (lower ? numeral.toLowerCase() : numeral);
}

/* ------------------------------------------------------------------
   The other way: a number back into a chord.

   The one function here with no Dart original. The app only ever goes from
   letters to numbers, because a song in the app always has letters. On a
   page where somebody is handed 1 4 5 and has to play it in E, the other
   direction is the whole point — so it is written as the exact inverse of
   [chordAsDegree], and tested as one: every chord of every key goes round
   the loop and comes back itself.
   ------------------------------------------------------------------ */

const NASHVILLE_IDS = reverse(NASHVILLE_SUFFIXES);

/* Roman suffixes collide by design — ii and II are both "", ii7 and V7 are
   both "7" — because the case says which. So the reverse table is two. */
const ROMAN_IDS_UPPER = {
  '': 'maj', '°': 'dim', '+': 'aug', '7': '7', maj7: 'maj7', '°7': 'dim7',
  'ø7': 'hdim7', '6': 'maj6', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  '7sus4': '7sus4', '5': '5', '9': '9', maj9: 'maj9', '11': '11', '13': '13',
};
const ROMAN_IDS_LOWER = {
  '': 'min', '°': 'dim', '+': 'aug', '7': 'min7', maj7: 'maj7', '°7': 'dim7',
  'ø7': 'hdim7', '6': 'min6', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  '7sus4': '7sus4', '5': '5', '9': 'min9', maj9: 'maj9', '11': '11', '13': '13',
};

function reverse(table) {
  const out = {};
  for (const [id, text] of Object.entries(table)) {
    if (!(text in out)) out[text] = id;
  }
  return out;
}

const ROMAN_OF = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
/* Longest numeral first, or "IV" would read as a I with a V stuck to it. */
const DEGREE_HEAD = /^([♭♯b#])?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i|[1-7])(.*)$/;

function accidentalShift(mark) {
  if (mark === '♭' || mark === 'b') return -1;
  if (mark === '♯' || mark === '#') return 1;
  return 0;
}

/** A degree token pulled apart, or null when it is not one. */
function degreeParts(token) {
  const raw = String(token).trim();
  if (raw === '') return null;
  const match = DEGREE_HEAD.exec(raw);
  if (match === null) return null;
  const head = match[2];
  const roman = !/^[1-7]$/.test(head);
  const upper = roman && head === head.toUpperCase();
  const number = roman ? ROMAN_OF[head.toUpperCase()] : Number(head);
  if (number === undefined) return null;

  let rest = match[3];
  let bass = null;
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    bass = rest.substring(slash + 1).trim();
    rest = rest.substring(0, slash);
  }
  const quality = roman
    ? (upper ? ROMAN_IDS_UPPER : ROMAN_IDS_LOWER)[rest]
    : NASHVILLE_IDS[rest];
  if (quality === undefined) return null;
  if (bass !== null && bass !== '' && degreeNumberParts(bass) === null) return null;
  return { shift: accidentalShift(match[1]), number, roman, quality, bass };
}

/** A plain degree number with an optional accidental — what a slash bass is. */
function degreeNumberParts(token) {
  const match = /^([♭♯b#])?([1-7])$/.exec(String(token).trim());
  if (match === null) return null;
  return { shift: accidentalShift(match[1]), number: Number(match[2]) };
}

/** Whether a token is written the way a number or a numeral is written. */
export function isDegreeName(token) {
  return degreeParts(token) !== null;
}

/** The chord a degree is, in a key: the exact inverse of [chordAsDegree].
 *
 * Returns null for anything it cannot read, which is a caller's cue to leave
 * the token exactly as it was written.
 */
export function degreeAsChord(token, key, options = {}) {
  const fromMinorTonic = options.fromMinorTonic === true;
  const parts = degreeParts(token);
  if (parts === null) return null;

  const keyMatch = /^([A-G][#b]?)\s*(.*)$/.exec(String(key).trim());
  if (keyMatch === null) return null;
  const tonicPitch = PITCH[keyMatch[1]];
  if (tonicPitch === undefined) return null;
  const rest = keyMatch[2].toLowerCase();
  const minor = rest.startsWith('min') || rest === 'm' || rest.startsWith('aeolian');
  const roman = parts.roman;
  const relative = minor && !roman && !fromMinorTonic;
  const counted = relative ? tonicPitch + 3 : tonicPitch;
  const minorScale = minor && roman;

  const rootPitch = counted + stepOf(parts, minorScale);
  const written = noteName(rootPitch, false) + (SHORT_FORMS[parts.quality] ?? '');
  const under = parts.bass === null || parts.bass === ''
    ? ''
    : '/' + noteName(counted + stepOf(degreeNumberParts(parts.bass), minorScale), false);
  // Spelled by the key it landed in, the same rule the letters go through
  // everywhere else: B♭ in a flat key, and a slash bass named from the chord
  // when it is one of the chord's own notes.
  return spellInKey(written + under, key);
}

function stepOf(parts, minorScale) {
  const natural = (minorScale ? MINOR_STEP_OF : MAJOR_STEP_OF)[parts.number];
  // vii° in a minor key is the leading-tone chord, which the minor scale's
  // own 7 is a semitone below — the inverse of the rule in [degreeText].
  const leadingTone = minorScale && parts.number === 7 && parts.shift === 0 &&
    parts.quality !== undefined && DIMINISHED_QUALITY_IDS.has(parts.quality);
  return natural + parts.shift + (leadingTone ? 1 : 0);
}

/* ==================================================================
   Shapes, and the capos that reach them
   ================================================================== */

/* Open shapes worth knowing, by written chord name. These beat any movable
   shape when they exist — an open G rings, a barred one does not. */
const OPEN_SHAPES = {
  C: [-1, 3, 2, 0, 1, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  Dm7: [-1, -1, 0, 2, 1, 1],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Dsus2: [-1, -1, 0, 2, 3, 0],
  Dsus4: [-1, -1, 0, 2, 3, 3],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  Emaj7: [0, 2, 1, 1, 0, 0],
  Esus4: [0, 2, 2, 2, 0, 0],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  A7: [-1, 0, 2, 0, 2, 0],
  Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0],
  Asus2: [-1, 0, 2, 2, 0, 0],
  Asus4: [-1, 0, 2, 2, 3, 0],
  B7: [-1, 2, 1, 2, 0, 2],
  Fmaj7: [-1, -1, 3, 2, 1, 0],
  E5: [0, 2, 2, -1, -1, -1],
  A5: [-1, 0, 2, 2, -1, -1],
  D5: [-1, -1, 0, 2, 3, -1],
};

/* Ukulele shapes worth knowing, fourth string to first. A hand-written table
   rather than the guitar shapes moved over, for the reason a uke player would
   give: G C E A is the guitar's top four strings up a fourth, so deriving one
   from the other gets the notes right and the grip wrong. */
const UKULELE_SHAPES = {
  C: [0, 0, 0, 3], C7: [0, 0, 0, 1], Cmaj7: [0, 0, 0, 2],
  Cm: [0, 3, 3, 3], Cm7: [3, 3, 3, 3],
  Db: [1, 1, 1, 4], Dbm: [1, 1, 0, 4], Db7: [1, 1, 1, 2],
  D: [2, 2, 2, 0], Dm: [2, 2, 1, 0], D7: [2, 2, 2, 3], Dm7: [2, 2, 1, 3],
  Dmaj7: [2, 2, 2, 4], Dsus2: [2, 2, 0, 0], Dsus4: [0, 2, 3, 0],
  Eb: [3, 3, 3, 1], Ebm: [3, 3, 2, 1], Eb7: [3, 3, 3, 4],
  E: [1, 4, 0, 2], Em: [0, 4, 3, 2], E7: [1, 2, 0, 2], Em7: [0, 2, 0, 2],
  Emaj7: [1, 3, 0, 2], Esus4: [2, 4, 0, 2],
  F: [2, 0, 1, 0], Fm: [1, 0, 1, 3], F7: [2, 3, 1, 0], Fm7: [1, 3, 1, 3],
  Fmaj7: [2, 4, 1, 3],
  'F#': [3, 1, 2, 1], 'F#m': [2, 1, 2, 0], 'F#m7': [2, 4, 2, 4],
  G: [0, 2, 3, 2], Gm: [0, 2, 3, 1], G7: [0, 2, 1, 2], Gm7: [0, 2, 1, 1],
  Gmaj7: [0, 2, 2, 2], Gsus4: [0, 2, 3, 3],
  Ab: [1, 3, 4, 3], Abm: [1, 3, 4, 2], Ab7: [1, 3, 2, 3],
  A: [2, 1, 0, 0], Am: [2, 0, 0, 0], A7: [0, 1, 0, 0], Am7: [0, 0, 0, 0],
  Amaj7: [1, 1, 0, 0], Asus2: [2, 4, 0, 2], Asus4: [2, 2, 0, 0],
  Bb: [3, 2, 1, 1], Bbm: [3, 1, 1, 1], Bb7: [1, 2, 1, 1], Bbm7: [1, 1, 1, 1],
  Bbmaj7: [3, 2, 1, 0],
  B: [4, 3, 2, 2], Bm: [4, 2, 2, 2], B7: [2, 3, 2, 2], Bm7: [2, 2, 2, 2],
};

/** Which instrument a chord is read for.
 *
 * A ukulele is a shorter instrument and the fret a capo is worth going to is
 * shorter with it. Scored against the guitar's seven a uke player was sent to
 * the 7th fret for a blues in G — two of whose chords were already open, on
 * an instrument whose body starts at the 12th.
 *
 * The chart reaches one fret further than the offer does, because the two are
 * different acts: the offer is advice, and the chart is the arithmetic laid
 * out for somebody to pick from. The 5th fret is the one that puts B♭ on F
 * shapes, which is the chord a uke player wants when the band is in the key
 * they dread.
 */
export const GUITAR = {
  id: 'guitar',
  label: 'Guitar',
  table: OPEN_SHAPES,
  takesACapo: true,
  highestCapo: 7,
  highestCapoOnTheChart: 7,
};

export const UKULELE = {
  id: 'ukulele',
  label: 'Ukulele',
  table: UKULELE_SHAPES,
  takesACapo: true,
  highestCapo: 4,
  highestCapoOnTheChart: 5,
};

/* The name of the open shape a chord falls on for an instrument, or null.

   Open means the same thing on both necks: a grip with a string still ringing
   in it. Every guitar entry is one by definition; a good third of the
   ukulele's first-position grips are not — a Bm there is a full barre at the
   2nd fret — so a capo is never offered on the strength of one of those.

   What comes back is the house spelling and not whichever one the uke table
   happens to be filed under: the one open minor grip on pitch 1 is filed as
   D♭m, and every chart in the world calls that chord C♯m. */
function openShapeName(pitch, qualityId, reading) {
  const short = SHORT_FORMS[qualityId];
  if (short === undefined) return null;
  const table = reading.table;
  const grip = table[noteName(pitch, false) + short] ?? table[noteName(pitch, true) + short];
  if (grip === undefined || !grip.includes(0)) return null;
  const minor = QUALITIES[qualityId]?.intervals.includes(3) ?? false;
  return noteName(pitch, pitchUsesFlats(pitch, minor)) + short;
}

/** The capo that leaves the most of these chords on open shapes and the
 * fewest on barres, or null when no capo is worth the trouble.
 *
 * It counts the song's own chords rather than answering a question about the
 * key off five major shapes, which is what the old chart did — so it has
 * something to say about the Bm in bar 3 and about a song whose key nobody
 * found.
 *
 * It offers nothing when the song already sits open, when no capo beats no
 * capo, or when the best a capo can do is a single open shape: a song of
 * barre chords a capo cannot help is told nothing rather than sent up the
 * neck for one chord.
 */
export function capoThatHelps(chords, reading) {
  if (!reading.takesACapo) return null;
  const distinct = [];
  const seen = new Set();
  for (const label of chords) {
    const parts = chordParts(label);
    const pitch = parts === null ? undefined : PITCH[parts.root];
    if (parts === null || pitch === undefined) continue;
    const entry = pitch + '|' + parts.quality;
    if (seen.has(entry)) continue;
    seen.add(entry);
    distinct.push([pitch, parts.quality]);
  }
  // One chord is not a song, and a capo for it is a coin toss.
  if (distinct.length < 2) return null;

  let bestFret = 0;
  let bestOpen = -1;
  let bestBarres = 0;
  let bestShapes = [];
  for (let fret = 0; fret <= reading.highestCapo; fret += 1) {
    const shapes = [];
    let barres = 0;
    for (const [pitch, quality] of distinct) {
      const open = openShapeName((((pitch - fret) % 12) + 12) % 12, quality, reading);
      if (open !== null) {
        shapes.push(open);
      } else if (QUALITIES[quality]?.family != null) {
        barres += 1;
      }
    }
    // No capo is measured first and only beaten outright, so a tie stays at
    // the nut and a song that is already open is left alone.
    const better = shapes.length > bestOpen ||
      (shapes.length === bestOpen && barres < bestBarres);
    if (better) {
      bestFret = fret;
      bestOpen = shapes.length;
      bestBarres = barres;
      bestShapes = shapes;
    }
  }
  if (bestFret === 0 || bestShapes.length < 2) return null;
  return { fret: bestFret, shapes: bestShapes };
}

/** How many of these chords already ring open at the nut on this instrument.
 *
 * Not in the app, and not arithmetic either — it is the difference between
 * the two honest things a page can say when [capoThatHelps] offers nothing:
 * that the song is already open, or that a capo cannot help it.
 */
export function openAtTheNut(chords, reading) {
  const seen = new Set();
  let open = 0;
  let total = 0;
  for (const label of chords) {
    const parts = chordParts(label);
    const pitch = parts === null ? undefined : PITCH[parts.root];
    if (parts === null || pitch === undefined) continue;
    const entry = pitch + '|' + parts.quality;
    if (seen.has(entry)) continue;
    seen.add(entry);
    total += 1;
    if (openShapeName(pitch, parts.quality, reading) !== null) open += 1;
  }
  return { open, total };
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREES = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm', 'dim'];
const MINOR_QUALITIES = ['m', 'dim', '', 'm', 'm', '', ''];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

function prefersFlats(root) {
  if (root.includes('b')) return true;
  // F is the one natural that belongs to the flat side of the circle.
  return root === 'F';
}

/** The key as it is named — "A minor", "C# major", or a bare root, which is
 * read as major because that is what a bare letter means on a chart. */
export function keyReference(label) {
  const raw = String(label ?? '').trim();
  if (raw === '') return null;
  const match = /^([A-G][#b]?)\s*(.*)$/.exec(raw);
  if (match === null) return null;
  const tonic = match[1];
  const rest = match[2].toLowerCase();
  const tonicPitch = PITCH[tonic];
  if (tonicPitch === undefined) return null;

  const minor = rest.startsWith('min') || rest === 'm' || rest.startsWith('aeolian');
  const flats = prefersFlats(tonic);
  const steps = minor ? MINOR_STEPS : MAJOR_STEPS;
  const qualities = minor ? MINOR_QUALITIES : MAJOR_QUALITIES;
  const scale = steps.map((step) => noteName(tonicPitch + step, flats));

  return {
    display: tonic + ' ' + (minor ? 'minor' : 'major'),
    tonic,
    minor,
    scale,
    degrees: minor ? MINOR_DEGREES : MAJOR_DEGREES,
    diatonic: scale.map((note, i) => note + qualities[i]),
    pentatonic: (minor ? MINOR_PENTATONIC : MAJOR_PENTATONIC)
      .map((step) => noteName(tonicPitch + step, flats)),
    relative: minor
      ? noteName(tonicPitch + 3, flats) + ' major'
      : noteName(tonicPitch + 9, flats) + ' minor',
  };
}

/** The capo chart for a key on the instrument in this person's hands, as
 * [fret, the key whose shapes are then under the fingers].
 *
 * A chart is not a fact about a key — it is a fact about a key in somebody's
 * hands, and whose hands is the one thing the old printed chart never asked.
 * The rows are derived from the same table the offer above is scored against,
 * so the two cannot come to disagree about what an open shape is. A key earns
 * a row when its own tonic chord is one.
 */
export function capoChart(key, reading) {
  if (!reading.takesACapo) return [];
  const tonicPitch = PITCH[key.tonic];
  if (tonicPitch === undefined) return [];
  const quality = key.minor ? 'min' : 'maj';
  const rows = [];
  for (let pitch = 0; pitch < 12; pitch += 1) {
    const shape = openShapeName(pitch, quality, reading);
    if (shape === null) continue;
    const fret = (((tonicPitch - pitch) % 12) + 12) % 12;
    // Fret 0 is the key itself: a key that already sits on an open shape
    // needs no capo and gets no row.
    if (fret >= 1 && fret <= reading.highestCapoOnTheChart) rows.push([fret, shape]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  return rows;
}

/* ==================================================================
   Reading a chart somebody pasted, and writing it back out
   ==================================================================

   Three shapes come in and they are three spellings of one thing: ChordPro
   with its chords in brackets, a row of chord names above a row of words, and
   words with the chords already bracketed inline.

   Two rules the reading obeys, both from the app. A chord line is recognised
   by the chord grammar above rather than by a loose pattern, so "Am I the
   only one" stays a lyric. And no line is ever lost — a line this cannot make
   sense of is kept exactly as it was written.

   One thing here is deliberately not the app's. The app stores every chart as
   ChordPro, because one stored spelling means one thing to draw and one thing
   to test. This gives you back what you pasted: a chart that came in as
   chords over words goes out as chords over words, with the words where they
   were. Nobody wants their chart handed back in a different notation. */

const TAB_START = new Set(['start_of_tab', 'sot']);
const TAB_END = new Set(['end_of_tab', 'eot']);
const FACT_DIRECTIVES = {
  title: 'title', t: 'title',
  artist: 'artist', a: 'artist', subtitle: 'artist', st: 'artist',
  key: 'key', k: 'key',
  capo: 'capo',
  tuning: 'tuning',
};

const BRACKETED_HEADING = /^\[([^[\]]{1,60})\]$/;
const TAB_LINE = /^[eEaAdDgGbB][#b]?\s*[|:]\s*[-–\d]/;
const LABELLED = /^([A-Za-z][A-Za-z0-9 '’.#-]{0,24}):\s*(\S.*)$/;
const DASH_RUN = /[-–]{5,}/;
const CAPO_LINE = /^capo\s*:?\s*(\d{1,2}[^,;]{0,20})$/i;
const STATED_FACT = /^(key|tuning)\s*:\s*(.{1,40})$/i;
const LEADING_MARK = /[|([:.,*%"“”]/;
const TRAILING_MARK = /[|)\]:.,*%"“”]/;
const REPEAT_MARK = /^(x\s*\d{1,2}|\d{1,2}\s*x|N\.?C\.?|-+|~+)$/i;

/** How long a chart is allowed to be. A very long song is a few thousand
 * characters; this is the same number the app keeps. */
export const CHART_LIMIT = 65536;

/* Every kind of space a paste can arrive with, written as the plain one. A
   chart copied out of an email, a Word document or a web page keeps its
   alignment with non-breaking spaces, because HTML collapses ordinary ones.
   Every column here is counted in characters and one of these is one
   character. The zero-width ones are taken out instead: they occupy no
   column. */
function plainSpaces(source) {
  return source
    .replace(/[​‌‍﻿]/g, '')
    .replace(/[   -   　]/g, ' ');
}

/* Tabs written out as spaces to a stop of eight, so a column means the same
   thing on the chord line and the words line under it. */
function tabsOut(line) {
  if (!line.includes('\t')) return line;
  let out = '';
  for (const character of line) {
    if (character === '\t') {
      out += ' '.repeat(((Math.floor(out.length / 8) + 1) * 8) - out.length);
    } else {
      out += character;
    }
  }
  return out;
}

function tokensWithColumns(line) {
  const tokens = [];
  let at = 0;
  while (at < line.length) {
    if (line[at] === ' ') { at += 1; continue; }
    const start = at;
    while (at < line.length && line[at] !== ' ') at += 1;
    tokens.push([line.substring(start, at), start]);
  }
  return tokens;
}

/* A token pulled apart into the marks a chart puts around a chord and the
   chord itself. The bare part is empty for a token that is nothing but marks,
   which is how a bar line or a repeat count passes through a chord line
   without making it words.

   The app throws the marks away, because it is about to draw the chord on a
   clock. This keeps them: "| G | C |" has to come back with its bar lines on,
   and losing them would be losing part of somebody's chart. */
function splitMarks(token) {
  let start = 0;
  while (start < token.length && LEADING_MARK.test(token[start])) start += 1;
  let end = token.length;
  while (end > start && TRAILING_MARK.test(token[end - 1])) end -= 1;
  const bare = token.substring(start, end);
  if (REPEAT_MARK.test(bare)) return { lead: token, bare: '', trail: '' };
  return { lead: token.substring(0, start), bare, trail: token.substring(end) };
}

function stripMarks(token) {
  return splitMarks(token).bare;
}

/* Whether every token on this line is a chord or a mark a chart puts beside
   one, and at least one of them is a chord. The whole line has to agree: one
   chord-shaped word does not make a lyric into music, which is exactly what
   "A" in "A man walks in" would do. */
function isChordLine(line, isName) {
  const tokens = line.split(/\s+/).filter((token) => token !== '');
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const token of tokens) {
    const bare = stripMarks(token);
    if (bare === '') continue;
    if (!isName(bare)) return false;
    chords += 1;
  }
  return chords > 0;
}

/* A line of numbers is held to one extra rule the chord grammar does not
   need. "I" is a Roman numeral and it is also the commonest word in English,
   so a lyric line of one word would otherwise be read as music. A row of
   numbers is either more than one token, or a token with a digit or a quality
   on it. */
function isDegreeLine(line) {
  const tokens = line.split(/\s+/).filter((token) => token !== '');
  const bare = tokens.map(stripMarks).filter((token) => token !== '');
  if (bare.length === 0) return false;
  if (!bare.every(isDegreeName)) return false;
  return bare.length > 1 || /\d/.test(bare[0]) || bare[0].length > 1;
}

function looksLikeTab(line) {
  return TAB_LINE.test(line) || DASH_RUN.test(line);
}

function directiveOf(line) {
  if (!line.startsWith('{') || !line.endsWith('}')) return null;
  const inside = line.substring(1, line.length - 1).trim();
  if (inside === '') return null;
  const colon = inside.indexOf(':');
  if (colon < 0) return [inside.toLowerCase(), ''];
  return [inside.substring(0, colon).trim().toLowerCase(), inside.substring(colon + 1).trim()];
}

/* What a chart says about itself on a line of its own. A colon is required
   for the key and the tuning, because "Key to my heart" and "Tuning out the
   world" are lyrics. A capo is allowed without one, and only when a number
   follows, because "Capo 2" is how every tab site writes it and there is no
   line of words shaped like that. */
function factIn(line) {
  const capo = CAPO_LINE.exec(line);
  if (capo !== null) {
    return { name: 'capo', value: capo[1].trim(), whole: capo[1] };
  }
  const stated = STATED_FACT.exec(line);
  if (stated !== null) {
    return { name: stated[1].toLowerCase(), value: stated[2].trim(), whole: stated[2] };
  }
  return null;
}

/* Whether the line under a chord line is words the chords belong over. */
function isWordsUnder(line, isName) {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (directiveOf(trimmed) !== null) return false;
  if (BRACKETED_HEADING.test(trimmed)) return false;
  if (looksLikeTab(trimmed)) return false;
  if (factIn(trimmed) !== null) return false;
  if (isChordLine(trimmed, isName)) return false;
  // Words that already carry their own chords are not waiting for a row of
  // them above; the row above is an intro or a turnaround of its own.
  if (trimmed.includes('[') && trimmed.includes(']')) return false;
  return true;
}

/* Every token of a chord row, with the column it was written in and whether
   it is a chord. Column arithmetic is the only thing holding a chord row and
   the words under it together: a chord name starts above the letter it
   changes on. Tabs are spelled out to a stop of eight first, because a chart
   written in a text editor lines its chords up with tabs. */
function chordRowItems(line, indent, isName) {
  const items = [];
  let any = false;
  for (const [token, column] of tokensWithColumns(tabsOut(line))) {
    const parts = splitMarks(token);
    if (parts.bare !== '' && isName(parts.bare)) {
      items.push({ at: column - indent, chord: parts.bare, lead: parts.lead, trail: parts.trail });
      any = true;
    } else {
      items.push({ at: column - indent, text: token });
    }
  }
  return any ? items : null;
}

/* A chord line over a words line. Null when nothing on the row above came
   back as a chord, so the caller can keep that row rather than lose it. */
function chordsOverWords(chordLine, wordLine, isName) {
  const below = tabsOut(wordLine);
  const indent = below.length - below.trimStart().length;
  const items = chordRowItems(chordLine, indent, isName);
  if (items === null) return null;
  return {
    kind: 'words', shape: 'over', text: below.trim(), indent, items,
    chords: items.filter((item) => item.chord !== undefined),
  };
}

/* A row of chords with nothing under it. */
function chordsAlone(line, isName) {
  const items = chordRowItems(line, 0, isName);
  if (items === null) return null;
  return {
    kind: 'chords', shape: 'over', text: '', indent: 0, items,
    chords: items.filter((item) => item.chord !== undefined),
  };
}

/* Words with their chords already in brackets. A bracket holding something
   that is not a chord — [x4], [Riff] — is left in the words exactly as it was
   written: guessing it was a chord would put a chord nobody wrote on the
   page, and dropping it would lose a line. */
function wordsWithInlineChords(line, isName) {
  let words = '';
  const chords = [];
  let index = 0;
  while (index < line.length) {
    const open = line.indexOf('[', index);
    if (open < 0) { words += line.substring(index); break; }
    const close = line.indexOf(']', open + 1);
    if (close < 0) { words += line.substring(index); break; }
    words += line.substring(index, open);
    const inside = line.substring(open + 1, close).trim();
    if (isName(inside)) {
      chords.push({ chord: inside, at: words.length });
    } else {
      words += line.substring(open, close + 1);
    }
    index = close + 1;
  }
  if (chords.length === 0) {
    return { kind: 'text', raw: line.trimEnd() };
  }
  return { kind: 'words', shape: 'inline', text: words.trimEnd(), indent: 0, chords };
}

/** A chart, whichever of the three shapes it came in.
 *
 * `degrees: true` reads numbers and Roman numerals where chord names would
 * otherwise be, which is what the Nashville page needs to go the other way.
 */
export function readChart(source, options = {}) {
  const isName = options.degrees === true ? isDegreeName : isChordName;
  const isRow = options.degrees === true
    ? (line) => isDegreeLine(line)
    : (line) => isChordLine(line, isName);
  const raw = plainSpaces(String(source))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const lines = [];
  let index = 0;
  let inTab = false;

  while (index < raw.length) {
    const line = raw[index];
    const trimmed = line.trim();

    if (inTab) {
      const closing = directiveOf(trimmed);
      if (closing !== null && TAB_END.has(closing[0])) inTab = false;
      lines.push({ kind: inTab ? 'tab' : 'text', raw: line.trimEnd() });
      index += 1;
      continue;
    }

    if (trimmed === '') {
      lines.push({ kind: 'blank', raw: '' });
      index += 1;
      continue;
    }

    const directive = directiveOf(trimmed);
    if (directive !== null) {
      const [name, value] = directive;
      if (TAB_START.has(name)) {
        inTab = true;
        lines.push({ kind: 'text', raw: line.trimEnd() });
      } else if (FACT_DIRECTIVES[name] !== undefined) {
        lines.push({
          kind: 'fact', name: FACT_DIRECTIVES[name], value,
          form: 'directive', label: name, raw: trimmed,
        });
      } else {
        // A directive this does not know — {tempo: 96}, somebody's own
        // extension, a heading. Kept exactly as written.
        lines.push({ kind: 'text', raw: line.trimEnd() });
      }
      index += 1;
      continue;
    }

    // A part's name in square brackets, the way every tab site writes one.
    // [C] on its own is a chord and not a heading, which is the one case the
    // two spellings collide on.
    const bracketed = BRACKETED_HEADING.exec(trimmed);
    if (bracketed !== null && !isChordName(bracketed[1].trim())) {
      lines.push({ kind: 'text', raw: line.trimEnd() });
      index += 1;
      continue;
    }

    // A chord row is read as one before tablature is looked for, because the
    // two spellings overlap: "G | C | D" is a row of chords written with bar
    // lines and not a string of a tab.
    if (isRow(trimmed)) {
      const next = index + 1 < raw.length ? raw[index + 1] : null;
      if (next !== null && isWordsUnder(next, isName)) {
        const married = chordsOverWords(line, next, isName);
        if (married !== null) {
          lines.push(married);
          index += 2;
          continue;
        }
      }
      const alone = chordsAlone(line, isName);
      lines.push(alone ?? { kind: 'text', raw: line.trimEnd() });
      index += 1;
      continue;
    }

    if (looksLikeTab(trimmed)) {
      lines.push({ kind: 'tab', raw: line.trimEnd() });
      index += 1;
      continue;
    }

    const fact = factIn(trimmed);
    if (fact !== null) {
      lines.push({
        kind: 'fact', name: fact.name, value: fact.value, form: 'plain',
        prefix: trimmed.substring(0, trimmed.length - fact.whole.length),
        raw: trimmed,
      });
      index += 1;
      continue;
    }

    // "Intro: G  C  D" — a name for the part and the chords of it on one
    // line, which is how a tab site writes an intro. Read as the two things
    // it is, so the chords move with every other chord on the page.
    const labelled = LABELLED.exec(trimmed);
    if (labelled !== null && isRow(labelled[2].trim())) {
      const row = chordsAlone(labelled[2], isName);
      if (row !== null) {
        row.label = trimmed.substring(0, trimmed.length - labelled[2].length);
        lines.push(row);
        index += 1;
        continue;
      }
    }

    lines.push(wordsWithInlineChords(line, isName));
    index += 1;
  }

  const key = lines.find((line) => line.kind === 'fact' && line.name === 'key');
  const capo = lines.find((line) => line.kind === 'fact' && line.name === 'capo');
  return {
    lines,
    key: key === undefined ? null : key.value,
    capo: capo === undefined ? null : capo.value,
    chords: chordsUsed(lines),
  };
}

/** Every chord the chart reaches for, once each, in the order they appear. */
export function chordsUsed(lines) {
  const seen = [];
  for (const line of lines) {
    for (const chord of line.chords ?? []) {
      if (!seen.includes(chord.chord)) seen.push(chord.chord);
    }
  }
  return seen;
}

/** How many frets up a chart's Capo line puts the chords, or zero.
 *
 * A chart says "Capo 2" and then writes the shapes a hand makes, which sound
 * two semitones higher than they are written. The line is kept as the chart
 * wrote it — "2", "2nd fret", "3 (or play in G)" — so only the number at the
 * front is read, and a line with no number at the front is no capo at all
 * rather than a guess.
 */
export function chartCapoFrets(chart) {
  const said = chart.capo === null || chart.capo === undefined ? '' : String(chart.capo).trim();
  if (said === '') return 0;
  const match = /^(\d{1,2})/.exec(said);
  const frets = match === null ? 0 : Number(match[1]);
  return frets < 0 || frets > 12 ? 0 : frets;
}

/** The key a chart says it is in, read through the key grammar. A chart that
 * wrote a sentence there has no key as far as this is concerned, which is
 * better than counting numbers from a word. Nothing is guessed from the
 * chords: a guessed key silently renumbers somebody's whole page. */
export function chartKey(chart) {
  const said = chart.key === null || chart.key === undefined ? '' : String(chart.key).trim();
  if (said === '') return null;
  return keyRootPitch(said) === null ? null : said;
}

/* ------------------------------------------------------------------
   Writing it back out.

   Every line comes back as a list of pieces — plain text, or a chord — so
   that one layout serves both the copy button (join the strings) and the page
   (wrap the chords in a span and let them flip). Escaping happens once, at
   the end, where the HTML is made.
   ------------------------------------------------------------------ */

/* A row of tokens laid back out in the columns they were written in. A chord
   whose new name is longer pushes whatever follows it one space to the right
   rather than running into it, which is the one thing that has to give. */
function tokenRow(items, move, indent, start = 0) {
  const pieces = [];
  let column = start;
  let first = true;
  for (const item of items) {
    const at = Math.max(item.at + indent, first ? column : column + 1);
    first = false;
    if (at > column) pieces.push({ text: ' '.repeat(at - column) });
    if (item.chord === undefined) {
      pieces.push({ text: item.text });
      column = at + item.text.length;
      continue;
    }
    const moved = move(item.chord);
    if (item.lead !== '') pieces.push({ text: item.lead });
    pieces.push({ chord: moved });
    if (item.trail !== '') pieces.push({ text: item.trail });
    column = at + item.lead.length + moved.length + item.trail.length;
  }
  return pieces;
}

function inlineRow(text, chords) {
  const pieces = [];
  let cursor = 0;
  for (const chord of chords) {
    const at = Math.min(Math.max(chord.at, 0), text.length);
    if (at > cursor) {
      pieces.push({ text: text.substring(cursor, at) });
      cursor = at;
    }
    pieces.push({ chord: '[' + chord.chord.replace(/\[/g, '(').replace(/]/g, ')') + ']' });
  }
  if (cursor < text.length) pieces.push({ text: text.substring(cursor) });
  return pieces;
}

/** The chart laid out again, as rows of pieces.
 *
 * `move(chordName)` is whatever the page is doing to each chord. `facts` says
 * what the key and capo lines should now read: the key the shapes are in, and
 * the fret. An existing line is rewritten, a capo line is added when a capo
 * was put on and the chart had none, and a capo line is dropped when the capo
 * came off. Nothing else on the page is touched — no line is invented, no
 * line is lost, and every line that is not a chord comes back exactly as it
 * was pasted.
 */
export function layoutChart(chart, move, facts = {}) {
  const rows = [];
  let capoWritten = false;
  let keyRow = -1;

  for (const line of chart.lines) {
    if (line.kind === 'words' && line.shape === 'over') {
      rows.push(tokenRow(line.items, move, line.indent));
      rows.push([{ text: ' '.repeat(line.indent) + line.text }]);
      continue;
    }
    if (line.kind === 'words') {
      const moved = line.chords.map((chord) => ({ chord: move(chord.chord), at: chord.at }));
      rows.push(inlineRow(line.text, moved));
      continue;
    }
    if (line.kind === 'chords') {
      const label = line.label ?? '';
      rows.push(label === ''
        ? tokenRow(line.items, move, 0)
        : [{ text: label }].concat(tokenRow(line.items, move, label.length, label.length)));
      continue;
    }
    if (line.kind === 'fact' && line.name === 'key' && facts.key !== undefined) {
      keyRow = rows.length;
      rows.push([{ text: writeFact(line, facts.key) }]);
      continue;
    }
    if (line.kind === 'fact' && line.name === 'capo' && facts.capo !== undefined) {
      if (facts.capo > 0) {
        capoWritten = true;
        rows.push([{ text: writeFact(line, String(facts.capo)) }]);
      }
      // A capo of none is not a fact worth writing, so the line goes.
      continue;
    }
    rows.push([{ text: line.raw ?? '' }]);
  }

  // A capo somebody put on has to be written down or the chart is wrong.
  if (!capoWritten && facts.capo !== undefined && facts.capo > 0) {
    rows.splice(keyRow + 1, 0, [{ text: 'Capo ' + facts.capo }]);
  }
  return rows;
}

function writeFact(line, value) {
  if (line.form === 'directive') return '{' + line.label + ': ' + value + '}';
  return line.prefix + value;
}

/** The rows as plain text — what the copy button puts on the clipboard. */
export function rowsAsText(rows) {
  return rows
    .map((row) => row.map((piece) => piece.text ?? piece.chord).join('').trimEnd())
    .join('\n');
}

/* ==================================================================
   The page
   ================================================================== */

/* Where this visitor came from. A flier on a board, a card on a merch table,
   a link under a video: each carries ?c=<code>. The page keeps the code for
   the visit and for next time, the two counters below carry it, and the link
   onward to the app carries it as ?from=, so an account made there can say
   which board it came from. The code names a place, never a person.

   Copied from chords.js rather than shared, because the shared count.js that
   both will load is in the other open pull request. When that lands, these
   twenty lines come out and the pages load count.js instead. */
const ENDPOINT = 'https://gzcoclsfvazfhcheefhz.supabase.co/functions/v1/analyze-public';

const CODE = (() => {
  try {
    const raw = new URL(location.href).searchParams.get('c');
    if (raw && /^[a-z0-9-]{1,32}$/i.test(raw)) {
      localStorage.setItem('colabroom_code', raw.toLowerCase());
      return raw.toLowerCase();
    }
    return localStorage.getItem('colabroom_code') || '';
  } catch (_) {
    return '';
  }
})();

function note(step) {
  try {
    fetch(ENDPOINT + '/note?step=' + encodeURIComponent(step) +
      (CODE ? '&c=' + encodeURIComponent(CODE) : ''), {
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    /* Measurement never breaks the page it measures. */
  }
}

const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/* The chords turn over as they change key. Small on purpose: the thing that
   moved is the thing that should move, and the words underneath must not so
   much as twitch or the column alignment stops reading as alignment. */
function rowsAsHtml(rows) {
  return rows
    .map((row) => row
      .map((piece) => piece.chord === undefined
        ? escapeHtml(piece.text)
        : '<span class="ch">' + escapeHtml(piece.chord) + '</span>')
      .join(''))
    .join('\n');
}

function draw(target, rows) {
  target.innerHTML = rowsAsHtml(rows);
  // Restarting the animation needs the class off, a reflow, and the class on.
  target.classList.remove('flip');
  void target.offsetWidth;
  target.classList.add('flip');
}

const KEY_CHOICES = [
  'C major', 'C# major', 'D major', 'Eb major', 'E major', 'F major',
  'F# major', 'G major', 'Ab major', 'A major', 'Bb major', 'B major',
  'C minor', 'C# minor', 'D minor', 'Eb minor', 'E minor', 'F minor',
  'F# minor', 'G minor', 'Ab minor', 'A minor', 'Bb minor', 'B minor',
];

function fillKeys(select, withUnknown) {
  if (withUnknown) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Not sure';
    select.append(none);
  }
  for (const key of KEY_CHOICES) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    select.append(option);
  }
}

/* One counter, once. "opened" says somebody arrived; "tool_used" says they
   did the thing the page exists for, which on a page whose example is already
   filled in is the first change they make themselves. */
let usedNoted = false;
function noteUsed() {
  if (usedNoted) return;
  usedNoted = true;
  note('tool_used');
}

/* ------------------------------------------------------------------
   Transpose
   ------------------------------------------------------------------ */

function wireTranspose() {
  const chartBox = document.querySelector('#chart-in');
  const fromKey = document.querySelector('#from-key');
  const toKey = document.querySelector('#to-key');
  const capo = document.querySelector('#capo');
  const answer = document.querySelector('#answer');
  const sheet = document.querySelector('#sheet');
  const note1 = document.querySelector('#chart-note');

  fillKeys(fromKey, true);
  fillKeys(toKey, false);
  toKey.value = 'A major';

  let chart = null;
  let chartCapo = 0;
  let touchedFrom = false;

  function reread() {
    chart = readChart(chartBox.value.slice(0, CHART_LIMIT));
    chartCapo = chartCapoFrets(chart);
    const said = chartKey(chart);
    if (said !== null && !touchedFrom) {
      // The chart's key line is what the shapes are written in; with a capo
      // on, the song sounds that many semitones higher.
      fromKey.value = matchKey(keyAsPlayed(said, chartCapo));
      capo.value = String(chartCapo);
    }
    note1.textContent = said === null
      ? ''
      : chartCapo > 0
        ? 'Your chart says it is in ' + said + ' with a capo on ' + chartCapo +
          ', so it sounds in ' + keyAsPlayed(said, chartCapo) + '.'
        : 'Your chart says it is in ' + said + '.';
    render();
  }

  function render() {
    if (chart === null) return;
    const sounding = fromKey.value;
    const fret = Number(capo.value);
    const move = sounding === '' ? 0 : semitonesBetweenKeys(sounding, toKey.value);
    // The chart's chords are written under whatever capo the chart declared,
    // so they move by the difference between that capo and this one, plus
    // wherever the song is going.
    const delta = move + chartCapo - fret;
    const said = chartKey(chart);
    // The spelling follows the key the shapes end up written in, which is the
    // chart's own written key moved by the same amount its chords were.
    const writtenFrom = said ?? (sounding === '' ? null : transposeChord(sounding, -chartCapo));

    const facts = { capo: fret };
    if (said !== null) facts.key = keyAsPlayed(said, delta);
    const rows = layoutChart(chart, (chord) => chordAsPlayed(chord, delta, writtenFrom), facts);
    draw(sheet, rows);
    sheet.dataset.text = rowsAsText(rows);
    // "G major shapes · sounds in A major" is the same sentence twice over,
    // so the word major comes off before the line is built.
    const named = sounding.replace(/ major$/, '');
    answer.textContent = sounding === ''
      ? (fret > 0 ? 'Capo ' + fret : 'Moved by ' + delta + ' semitones')
      : fret > 0
        ? capoLine(named, fret, move)
        : 'Now in ' + capoLine(named, 0, move) + '.';
  }

  for (const control of [fromKey, toKey, capo]) {
    control.addEventListener('change', () => {
      if (control === fromKey) touchedFrom = true;
      noteUsed();
      render();
    });
  }
  chartBox.addEventListener('input', () => { noteUsed(); reread(); });
  document.querySelector('#up').addEventListener('click', () => {
    noteUsed();
    toKey.value = matchKey(keyAsPlayed(toKey.value, 1));
    render();
  });
  document.querySelector('#down').addEventListener('click', () => {
    noteUsed();
    toKey.value = matchKey(keyAsPlayed(toKey.value, -1));
    render();
  });
  reread();
}

/** The name in the key list for a key that came back spelled another way. */
function matchKey(key) {
  const pitch = keyRootPitch(key);
  const minor = keyIsMinor(key);
  if (pitch === null) return KEY_CHOICES[0];
  for (const choice of KEY_CHOICES) {
    if (keyRootPitch(choice) === pitch && keyIsMinor(choice) === minor) return choice;
  }
  return KEY_CHOICES[0];
}

/* ------------------------------------------------------------------
   Capo
   ------------------------------------------------------------------ */

function wireCapo() {
  const chartBox = document.querySelector('#chart-in');
  const answer = document.querySelector('#answer');
  const detail = document.querySelector('#answer-detail');
  const sheet = document.querySelector('#sheet');
  const keyPick = document.querySelector('#chart-key');
  const chartRows = document.querySelector('#capo-rows');
  const chartFor = document.querySelector('#chart-for');
  const chartNote = document.querySelector('#chart-note');

  fillKeys(keyPick, false);
  keyPick.value = 'Bb major';

  let reading = GUITAR;

  function instrument() {
    const chosen = document.querySelector('input[name="instrument"]:checked');
    return chosen !== null && chosen.value === 'ukulele' ? UKULELE : GUITAR;
  }

  function render() {
    const chart = readChart(chartBox.value.slice(0, CHART_LIMIT));
    const used = chart.chords;
    const found = capoThatHelps(used, reading);
    const fret = found === null ? 0 : found.fret;
    const said = chartKey(chart);
    // A chart that already has a capo on it writes its shapes under that
    // capo, so the fret below is on top of the one it came with.
    const already = chartCapoFrets(chart);

    const facts = { capo: already + fret };
    if (said !== null) facts.key = keyAsPlayed(said, -fret);
    const rows = layoutChart(chart, (chord) => chordAsPlayed(chord, -fret, said), facts);
    draw(sheet, rows);
    sheet.dataset.text = rowsAsText(rows);
    chartNote.textContent = already > 0
      ? 'Your chart already has a capo on ' + already + ', so this one goes on top of it.'
      : '';

    if (found !== null) {
      answer.textContent = 'Capo ' + found.fret + ', and these are your shapes.';
      detail.textContent = found.shapes.join('   ');
      return;
    }
    const nut = openAtTheNut(used, reading);
    if (nut.total < 2) {
      answer.textContent = 'Give it two chords.';
      detail.textContent = 'A capo for one chord is a coin toss.';
    } else if (nut.open === nut.total) {
      answer.textContent = 'No capo needed.';
      detail.textContent = 'Every one of those is already an open shape on a ' +
        reading.label.toLowerCase() + '.';
    } else {
      answer.textContent = 'A capo will not help this one.';
      detail.textContent = 'Nothing in the first ' + reading.highestCapo +
        ' frets leaves more of it open. Play it where it is.';
    }
  }

  function drawChart() {
    const key = keyReference(keyPick.value);
    const rows = key === null ? [] : capoChart(key, reading);
    chartFor.textContent = key === null ? '' : key.display + ' on a ' + reading.label.toLowerCase();
    chartRows.innerHTML = '';
    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'quiet-line';
      empty.textContent = 'Nothing to move to — that key is already on open shapes.';
      chartRows.append(empty);
      return;
    }
    for (const [fret, shape] of rows) {
      const row = document.createElement('div');
      row.className = 'capo-row';
      const left = document.createElement('span');
      left.className = 'capo-fret';
      left.textContent = 'Capo ' + fret;
      const right = document.createElement('span');
      right.className = 'capo-shape';
      right.textContent = shape + ' shapes';
      row.append(left, right);
      chartRows.append(row);
    }
  }

  /* The printable chart for every key is in the page as plain HTML, both
     instruments' worth, so it prints and reads with no JavaScript at all —
     which is the half of this page a teacher would link to. All this does is
     show the one that matches the radio. */
  function showFullChart() {
    const guitar = document.getElementById('full-guitar');
    const ukulele = document.getElementById('full-ukulele');
    if (guitar === null || ukulele === null) return;
    guitar.hidden = reading !== GUITAR;
    ukulele.hidden = reading !== UKULELE;
  }

  for (const radio of document.querySelectorAll('input[name="instrument"]')) {
    radio.addEventListener('change', () => {
      reading = instrument();
      noteUsed();
      render();
      drawChart();
      showFullChart();
    });
  }
  chartBox.addEventListener('input', () => { noteUsed(); render(); });
  keyPick.addEventListener('change', () => { noteUsed(); drawChart(); });
  render();
  drawChart();
}

/* ------------------------------------------------------------------
   Nashville numbers
   ------------------------------------------------------------------ */

function wireNumbers() {
  const chartBox = document.querySelector('#chart-in');
  const keyPick = document.querySelector('#chart-key');
  const sheet = document.querySelector('#sheet');
  const answer = document.querySelector('#answer');
  const minorRow = document.querySelector('#minor-row');
  const chartNote = document.querySelector('#chart-note');

  fillKeys(keyPick, false);
  keyPick.value = 'G major';
  let touchedKey = false;

  function way() {
    const chosen = document.querySelector('input[name="way"]:checked');
    return chosen === null ? 'to-numbers' : chosen.value;
  }

  function style() {
    const chosen = document.querySelector('input[name="style"]:checked');
    return chosen === null ? 'numbers' : chosen.value;
  }

  function fromMinorTonic() {
    const chosen = document.querySelector('input[name="minor"]:checked');
    return chosen !== null && chosen.value === 'tonic';
  }

  function render() {
    const toNumbers = way() === 'to-numbers';
    const chart = readChart(chartBox.value.slice(0, CHART_LIMIT), { degrees: !toNumbers });

    // The chart's own key line is the one to count from. Everything here is
    // counted from a key and nothing is guessed from the chords, because a
    // guessed key would silently renumber somebody's whole page.
    const said = chartKey(chart);
    if (said !== null && !touchedKey) keyPick.value = matchKey(said);
    chartNote.textContent = said === null
      ? 'Your chart does not say what key it is in, so pick it above.'
      : 'Your chart says it is in ' + said + '.';

    const key = keyPick.value;
    const roman = style() === 'roman';
    const tonic = fromMinorTonic();

    // Roman numerals count a minor key from its own tonic in every theory
    // class, so there is nothing to ask — and the chips are spelled in
    // Nashville's words, which would mean nothing there.
    minorRow.hidden = !(keyIsMinor(key) && !roman);

    const rows = layoutChart(chart, (chord) => toNumbers
      ? chordAsDegree(chord, key, { roman, fromMinorTonic: tonic }) ?? chord
      : degreeAsChord(chord, key, { fromMinorTonic: tonic }) ?? chord);
    draw(sheet, rows);
    sheet.dataset.text = rowsAsText(rows);

    const home = keyReference(key).tonic + (keyIsMinor(key) ? 'm' : '');
    const number = chordAsDegree(home, key, { roman, fromMinorTonic: tonic });
    answer.textContent = toNumbers
      ? 'In ' + key + ', ' + home + ' is ' + number + '.'
      : 'In ' + key + ', ' + number + ' is ' + home + '.';
  }

  for (const control of document.querySelectorAll(
    'input[name="way"], input[name="style"], input[name="minor"]')) {
    control.addEventListener('change', () => {
      noteUsed();
      if (control.name === 'way') swapExample(control.value);
      render();
    });
  }

  /* The box holds an example, and the example has to be in the language the
     tool is now reading. Swapped only while the box still holds the example
     we put there: somebody's own chart is theirs and is never replaced. */
  function swapExample(direction) {
    const letters = (chartBox.dataset.letters ?? '').trim();
    const numbers = (chartBox.dataset.numbers ?? '').trim();
    const showing = chartBox.value.trim();
    if (direction === 'to-numbers' && showing === numbers) chartBox.value = chartBox.dataset.letters;
    if (direction === 'to-letters' && showing === letters) chartBox.value = chartBox.dataset.numbers;
  }

  chartBox.addEventListener('input', () => { noteUsed(); render(); });
  keyPick.addEventListener('change', () => { touchedKey = true; noteUsed(); render(); });
  render();
}

/* ------------------------------------------------------------------
   The bits every tool page has
   ------------------------------------------------------------------ */

function wireShared() {
  const sheet = document.querySelector('#sheet');
  const copy = document.querySelector('#copy');
  const print = document.querySelector('#print');

  if (copy !== null) {
    copy.addEventListener('click', async () => {
      note('copied_text');
      const text = sheet.dataset.text ?? sheet.textContent;
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy the chart'; }, 1800);
      } catch (_) {
        copy.textContent = 'Select and copy above';
      }
    });
  }
  if (print !== null) print.addEventListener('click', () => window.print());

  for (const link of document.querySelectorAll('.onward')) {
    link.addEventListener('click', () => note('clicked_onward'));
  }
  for (const link of document.querySelectorAll('a[href*="app.colabroom.com"]')) {
    link.addEventListener('click', () => note('clicked_app'));
    // The code rides on to the app, where an account claims it.
    if (CODE) {
      try {
        const onward = new URL(link.href);
        onward.searchParams.set('from', CODE);
        link.href = onward.toString();
      } catch (_) { /* A link that cannot be rewritten still works as it was. */ }
    }
  }
  // And on to the chord tool, which reads ?c= the same way this page did.
  // Written onto the attribute rather than through URL, so the link stays the
  // relative one it was and a flier code still reaches the page it points at.
  if (CODE) {
    for (const link of document.querySelectorAll('a[data-carry-code]')) {
      const raw = link.getAttribute('href');
      if (raw === null || /[?&]c=/.test(raw)) continue;
      link.setAttribute('href',
        raw + (raw.includes('?') ? '&' : '?') + 'c=' + encodeURIComponent(CODE));
    }
  }
}

if (typeof document !== 'undefined') {
  const page = document.querySelector('[data-tool]');
  if (page !== null) {
    const which = page.dataset.tool;
    if (which === 'transpose') wireTranspose();
    if (which === 'capo') wireCapo();
    if (which === 'numbers') wireNumbers();
    wireShared();
    note('opened');
  }
}
