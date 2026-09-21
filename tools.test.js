/* The cases the app's own tests hold, run against the port.

   Run with: deno test tools.test.js

   Almost everything here came across from E:/colabroom/wt/read-main/test —
   music_reference_test.dart, written_like_musicians_test.dart,
   perform_keeps_your_key_test.dart, reading_in_numbers_test.dart,
   a_capo_that_helps_test.dart, a_capo_chart_for_the_uke_test.dart,
   a_setlist_that_knows_test.dart and musician_song_sheet_test.dart. The
   comments come with them, because a case whose reason has been left behind
   is a case somebody deletes the next time it is inconvenient.

   No test framework and no import. `deno test` is the whole dependency, and
   one four-line assert is cheaper than a version of anything. */

import {
  GUITAR, UKULELE,
  capoChart, capoLine, capoThatHelps, chartCapoFrets, chartKey, chordAsDegree,
  chordAsPlayed, chordDisplay, degreeAsChord, isChordName, isDegreeName,
  keyAsPlayed, keyIsMinor, keyReference, keyUsesFlats, layoutChart, noteName,
  openAtTheNut, pitchOf, readChart, rowsAsText, semitonesBetweenKeys,
  spellInKey, transposeChord,
} from './tools.js';

function eq(actual, expected, because) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error((because ? because + ': ' : '') + 'got ' + a + ', wanted ' + b);
  }
}

const TWELVE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TWENTY_FOUR = TWELVE.map((n) => n + ' major').concat(TWELVE.map((n) => n + ' minor'));

/* ==================================================================
   Flats in flat keys — written_like_musicians_test.dart

   South Of Midnight's sheet said "Key A# major", over A# and D# chords:
   B♭ major, written as nobody writes it.
   ================================================================== */

Deno.test('which keys are written with flats', () => {
  for (const key of ['A# major', 'Bb major', 'F major', 'D# major', 'G# major', 'C# major']) {
    eq(keyUsesFlats(key), true, key);
  }
  for (const key of ['D minor', 'G minor', 'C minor', 'F minor', 'A# minor']) {
    eq(keyUsesFlats(key), true, key);
  }
  // Six accidentals either way: written sharp, like F# major.
  eq(keyUsesFlats('D# minor'), false);
  for (const key of ['C major', 'G major', 'D major', 'A major', 'E major',
    'B major', 'F# major', 'A minor', 'E minor']) {
    eq(keyUsesFlats(key), false, key);
  }
  eq(keyUsesFlats(null), false);
  eq(keyUsesFlats(''), false);
});

Deno.test('the key and its chords are respelled', () => {
  eq(spellInKey('A# major', 'A# major'), 'Bb major');
  eq(spellInKey('A#', 'A# major'), 'Bb');
  eq(spellInKey('D#m7/A#', 'A# major'), 'Ebm7/Bb');
  eq(spellInKey('Gm', 'A# major'), 'Gm');
});

Deno.test('sharp keys, and flats somebody wrote, are left alone', () => {
  eq(spellInKey('F#m', 'D major'), 'F#m');
  eq(spellInKey('Bb', 'F major'), 'Bb');
  eq(spellInKey('A#', null), 'A#');
});

Deno.test('a minor key keeps its leading tone sharp', () => {
  eq(spellInKey('C#dim', 'D minor'), 'C#dim');
  eq(spellInKey('A#', 'D minor'), 'Bb');
});

Deno.test('a slash bass is spelled as the chord tone it is', () => {
  // The third of D is an F of some kind, so a flat key cannot call it Gb.
  eq(spellInKey('D/F#', 'D minor'), 'D/F#');
  eq(spellInKey('A/C#', 'D minor'), 'A/C#');
  // Basses the key already spelled right are spelled the same way still.
  eq(spellInKey('Bb/D', 'F major'), 'Bb/D');
  eq(spellInKey('Eb/G', 'Bb major'), 'Eb/G');
  eq(spellInKey('C/E', 'Eb major'), 'C/E');
  eq(spellInKey('Bbm7/F', 'Eb major'), 'Bbm7/F');
});

Deno.test('a bass that is not a chord tone follows the key', () => {
  eq(spellInKey('C/Bb', 'Eb major'), 'C/Bb');
  eq(spellInKey('C/A#', 'Eb major'), 'C/Bb');
  // A degree rather than a note, and a quality with a slash in it.
  eq(spellInKey('G#:maj/3', 'Eb major'), 'Ab:maj/3');
  eq(spellInKey('C#6/9', 'Eb major'), 'Db6/9');
});

Deno.test('a flat bass somebody wrote is not corrected to a sharp', () => {
  // The chord rule reads the same third in D/Gb and would call it F#.
  // Somebody typed that Gb, and a spelling somebody chose is theirs.
  eq(spellInKey('D/Gb', 'D minor'), 'D/Gb');
  eq(spellInKey('C+/Ab', 'Eb major'), 'C+/Ab');
});

/* ==================================================================
   Slash chords keep their bass — perform_keeps_your_key_test.dart

   From the audit of 17 September 2026: transposing moved only the root of a
   slash chord, so "G/B" up two read "A/B", with the wrong note under it.
   ================================================================== */

Deno.test('the bass moves with the root', () => {
  eq(transposeChord('G/B', 2), 'A/C#');
  eq(chordAsPlayed('G/B', 2, 'G'), 'A/C#');
  eq(transposeChord('Am7/G', 2), 'Bm7/A');
  eq(transposeChord('Bb/D', 2), 'C/E');
});

Deno.test('a note spelled E#, B#, Cb or Fb moves like any other', () => {
  // The bass was looked up in a smaller table than the rest of the app uses,
  // so E# stayed put while its root moved.
  eq(transposeChord('C#/E#', 2), 'D#/G');
  eq(chordAsPlayed('C#/E#', 2, 'C#'), 'Eb/G');
  eq(transposeChord('G/B#', -1), 'F#/B');
  eq(transposeChord('Cb', 1), 'C');
  eq(transposeChord('Fbmaj7/Cb', 2), 'F#maj7/C#');
});

Deno.test('down two from D is C, and the bass lands on E', () => {
  eq(chordAsPlayed('D/F#', -2, 'D'), 'C/E');
  eq(keyAsPlayed('D', -2), 'C');
});

Deno.test('a flat key spells root and bass with flats', () => {
  // D up one is E-flat major: D/A becomes Eb/Bb, not D#/A#.
  eq(chordAsPlayed('D/A', 1, 'D major'), 'Eb/Bb');
  eq(keyAsPlayed('D major', 1), 'Eb major');
  eq(chordAsPlayed('G/D', 3, 'G'), 'Bb/F');
  // The same chord in a sharp key stays sharp.
  eq(chordAsPlayed('G/D', 4, 'G'), 'B/F#');
});

Deno.test('a minor key does not flatten the third under the chord', () => {
  // E minor dropped two is D minor, where D/F# was reading D/Gb: the key is
  // flat, but that note is the chord's own third.
  eq(chordAsPlayed('E/G#', -2, 'E minor'), 'D/F#');
  eq(chordAsPlayed('D/F#', 0, 'D minor'), 'D/F#');
  eq(chordAsPlayed('E:maj/3', -2, 'E minor'), 'D/F#');
});

Deno.test('a Harte degree in the bass is not moved as if it were a note', () => {
  // G:maj/3 is G over its own third. Moving the root has already moved the
  // third; the degree stays a degree.
  eq(transposeChord('G:maj/3', 2), 'A:maj/3');
  eq(transposeChord('A:min7/b7', -2), 'G:min7/b7');
  eq(chordAsPlayed('G:maj/3', 2, 'G'), 'A/C#');
  eq(chordAsPlayed('G:maj/3', 3, 'G'), 'Bb/D');
  // A source that writes the bass out as a note has it moved.
  eq(transposeChord('G:maj/B', 2), 'A:maj/C#');
});

Deno.test('a slash that is not a bass, and chords that do not move', () => {
  eq(transposeChord('C6/9', 2), 'D6/9');
  eq(transposeChord('N', 3), 'N');
  eq(transposeChord('G/B', 0), 'G/B');
  eq(transposeChord('G/B', 12), 'G/B');
  eq(transposeChord('G/B', -12), 'G/B');
});

Deno.test('the plainest transposes of all', () => {
  // musician_song_sheet_test.dart
  eq(transposeChord('Bbmaj7', 2), 'Cmaj7');
  eq(transposeChord('F#m', -2), 'Em');
  eq(transposeChord('N.C.', 4), 'N.C.');
});

/* ==================================================================
   The distance between two keys — a_setlist_that_knows_test.dart
   ================================================================== */

Deno.test('semitones between two keys', () => {
  eq(semitonesBetweenKeys('G', 'A major'), 2);
  eq(semitonesBetweenKeys('A minor', 'C minor'), 3);
  eq(semitonesBetweenKeys('G major', 'F'), 10);
  eq(semitonesBetweenKeys('A# major', 'Bb'), 0);
  eq(semitonesBetweenKeys(null, 'Bb'), 0);
  eq(semitonesBetweenKeys('G', null), 0);
  eq(semitonesBetweenKeys('Raag Yaman', 'G'), 0);
});

Deno.test('a minor key counts from its relative major, and a parallel moves nothing', () => {
  eq(semitonesBetweenKeys('A minor', 'C major'), 0);
  eq(semitonesBetweenKeys('G major', 'E minor'), 0);
  eq(semitonesBetweenKeys('G', 'E minor'), 0);
  eq(semitonesBetweenKeys('A minor', 'A major'), 0);
  eq(semitonesBetweenKeys('G', 'G minor'), 0);
  eq(semitonesBetweenKeys('A minor', 'D major'), 2);
  eq(semitonesBetweenKeys('G major', 'Bb minor'), 6);
});

/* ==================================================================
   The number a chord is — reading_in_numbers_test.dart
   ================================================================== */

Deno.test('a major key counts its chords from the 1', () => {
  eq(chordAsDegree('G', 'G major'), '1');
  eq(chordAsDegree('C', 'G major'), '4');
  eq(chordAsDegree('D', 'G major'), '5');
  eq(chordAsDegree('Am', 'G major'), '2-');
  eq(chordAsDegree('Em', 'G major'), '6-');
  // A Mixolydian song's flat seventh, which is the chord that sends people
  // looking for numbers in the first place.
  eq(chordAsDegree('F', 'G major'), '♭7');
});

Deno.test('a slash chord names its bass as a number too', () => {
  // The V with the leading tone under it, written the way a chart writes it:
  // the bass is a note of the key, not a chord of its own.
  eq(chordAsDegree('D/F#', 'G major'), '5/7');
  eq(chordAsDegree('C/G', 'G major'), '4/1');
});

Deno.test('Roman numerals say the quality in the case', () => {
  eq(chordAsDegree('G', 'G major', { roman: true }), 'I');
  eq(chordAsDegree('Am', 'G major', { roman: true }), 'ii');
  eq(chordAsDegree('D', 'G major', { roman: true }), 'V');
  eq(chordAsDegree('Em', 'G major', { roman: true }), 'vi');
  // ii, not ii- : the case has already said it is minor.
  eq(chordAsDegree('Am7', 'G major', { roman: true }), 'ii7');
  eq(chordAsDegree('F#dim', 'G major', { roman: true }), 'vii°');
  eq(chordAsDegree('F', 'G major', { roman: true }), '♭VII');
});

Deno.test('sevenths and suspensions keep their own spelling', () => {
  eq(chordAsDegree('D7', 'G major'), '57');
  eq(chordAsDegree('Am7', 'G major'), '2-7');
  eq(chordAsDegree('Cmaj7', 'G major'), '4maj7');
  eq(chordAsDegree('Dsus4', 'G major'), '5sus4');
});

Deno.test('a minor song counts from its relative major by default', () => {
  // The convention the written system describes: A minor is counted against
  // C, so the home chord is the 6.
  eq(chordAsDegree('Am', 'A minor'), '6-');
  eq(chordAsDegree('F', 'A minor'), '4');
  eq(chordAsDegree('C', 'A minor'), '1');
  eq(chordAsDegree('G', 'A minor'), '5');
});

Deno.test('or from the minor tonic, for anybody who reads it that way', () => {
  eq(chordAsDegree('Am', 'A minor', { fromMinorTonic: true }), '1-');
  eq(chordAsDegree('F', 'A minor', { fromMinorTonic: true }), '♭6');
  eq(chordAsDegree('C', 'A minor', { fromMinorTonic: true }), '♭3');
  eq(chordAsDegree('G', 'A minor', { fromMinorTonic: true }), '♭7');
});

Deno.test('Roman numerals count a minor key from its own tonic, always', () => {
  // Am F C G in A minor is i VI III VII in a theory class. The relative major
  // is a Nashville convention, so the Nashville choice does not reach Roman
  // numerals either way.
  for (const fromMinorTonic of [false, true]) {
    const roman = (chord) => chordAsDegree(chord, 'A minor', { roman: true, fromMinorTonic });
    eq(roman('Am'), 'i');
    eq(roman('F'), 'VI');
    eq(roman('C'), 'III');
    eq(roman('G'), 'VII');
    eq(roman('Dm'), 'iv');
    eq(roman('Bdim'), 'ii°');
  }
});

Deno.test('a minor key in Roman numerals marks only what is borrowed', () => {
  // The harmonic minor's V and its leading-tone chord, written the way a
  // textbook writes them: V, and vii° without a sharp.
  eq(chordAsDegree('E', 'A minor', { roman: true }), 'V');
  eq(chordAsDegree('E7', 'A minor', { roman: true }), 'V7');
  eq(chordAsDegree('G#dim', 'A minor', { roman: true }), 'vii°');
  eq(chordAsDegree('G#dim7', 'A minor', { roman: true }), 'vii°7');
  // Anything else on the raised 7 keeps its sharp, so it cannot be read as
  // the key's own VII a semitone below.
  eq(chordAsDegree('G#', 'A minor', { roman: true }), '♯VII');
  // The Neapolitan, and the melodic minor's raised 6.
  eq(chordAsDegree('Bb', 'A minor', { roman: true }), '♭II');
  eq(chordAsDegree('F#dim', 'A minor', { roman: true }), '♯vi°');
  // The bass is counted against the same scale as the chord over it.
  eq(chordAsDegree('Am/C', 'A minor', { roman: true }), 'i/3');
  eq(chordAsDegree('E/G#', 'A minor', { roman: true }), 'V/♯7');
});

Deno.test('nothing it can place comes back as nothing, not as a guess', () => {
  eq(chordAsDegree('N', 'G major'), null);
  eq(chordAsDegree('', 'G major'), null);
  eq(chordAsDegree('G', 'not a key'), null);
});

Deno.test('the numbers do not move when the song does', () => {
  // A chart in numbers is the same chart after the singer changes key, which
  // is the entire reason those players read it.
  for (const transpose of [-5, 0, 2, 7]) {
    eq(chordAsDegree(chordDisplay('G:maj'), 'G'), '1', 'the 1 stopped being the 1');
    eq(chordAsPlayed('G:maj', transpose, 'G'), keyAsPlayed('G', transpose));
  }
  // chordDisplay resolves the degree bass first, so G over its third is the 1
  // with the 3 under it.
  eq(chordAsDegree(chordDisplay('G:maj/3'), 'G'), '1/3');
  eq(chordAsDegree(chordDisplay('A:min7'), 'G'), '2-7');
});

/* ==================================================================
   A capo — reading_in_numbers_test.dart
   ================================================================== */

Deno.test('a capo names the shapes and the key it still sounds in', () => {
  eq(capoLine('B', 4, 0), 'Capo 4 · G shapes · sounds in B');
  // A minor song keeps its word, because the shapes are minor shapes.
  eq(capoLine('G minor', 3, 0), 'Capo 3 · E minor shapes · sounds in G minor');
  // Somebody who has also moved the song reads both from where they are.
  eq(capoLine('B', 4, -2), 'Capo 4 · F shapes · sounds in A');
  eq(capoLine('B', 0, 0), 'B');
});

Deno.test('the chords come down by the fret the capo is on', () => {
  // A song in B with a capo on 4 is played with G, C and D shapes.
  eq(chordAsPlayed('B:maj', -4, 'B'), 'G');
  eq(chordAsPlayed('E:maj', -4, 'B'), 'C');
  eq(chordAsPlayed('F#:maj', -4, 'B'), 'D');
});

/* ==================================================================
   Keys and the capo chart — music_reference_test.dart
   ================================================================== */

Deno.test('keyReference builds the major scale and its chords', () => {
  const reference = keyReference('C major');
  eq(reference.minor, false);
  eq(reference.scale, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  eq(reference.diatonic, ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
  eq(reference.relative, 'A minor');
});

Deno.test('keyReference builds the natural minor scale and its chords', () => {
  const reference = keyReference('A minor');
  eq(reference.minor, true);
  eq(reference.scale, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  eq(reference.diatonic, ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
  eq(reference.relative, 'C major');
});

Deno.test('a bare root — the fallback detector — is read as major', () => {
  eq(keyReference('G').minor, false);
  eq(keyReference('G').display, 'G major');
  eq(keyReference(''), null);
  eq(keyReference('unknown'), null);
});

Deno.test('the pentatonic is five notes of the same scale', () => {
  eq(keyReference('E minor').pentatonic, ['E', 'G', 'A', 'B', 'D']);
});

Deno.test('capo options land on the key, and stay inside seven frets', () => {
  const capo = capoChart(keyReference('F major'), GUITAR);
  // F is five frets above C and one above E: both are playable, and the
  // shorter reach is offered first.
  eq(capo[0], [1, 'E']);
  for (const [fret] of capo) {
    if (fret < 1 || fret > 7) throw new Error('fret ' + fret + ' is off the neck');
  }
});

Deno.test('a key that is already an open shape asks for no capo', () => {
  eq(capoChart(keyReference('C major'), GUITAR).some((row) => row[1] === 'C'), false);
  eq(capoChart(keyReference('A minor'), GUITAR).some((row) => row[1] === 'Am'), false);
});

/* ==================================================================
   The capo chart is the instrument in your hands
   — a_capo_chart_for_the_uke_test.dart (#405)
   ================================================================== */

function shapesNamed(reading, minor) {
  const named = new Set();
  for (let pitch = 0; pitch < 12; pitch += 1) {
    const key = noteName(pitch, false) + (minor ? ' minor' : ' major');
    for (const [, shape] of capoChart(keyReference(key), reading)) named.add(shape);
  }
  return [...named].sort();
}

Deno.test('a ukulele in B♭ is shown the fret that puts it on F shapes', () => {
  eq(capoChart(keyReference('Bb major'), UKULELE), [[1, 'A'], [3, 'G'], [5, 'F']]);
  // The row nobody could reach before: F is five frets under B♭, and it is
  // the chord a uke player has when the band is in the key they dread.
  eq(capoChart(keyReference('Bb major'), GUITAR).some((row) => row[1] === 'F'), false);
});

Deno.test("a guitarist's chart is the chart it has always been", () => {
  eq(capoChart(keyReference('Bb major'), GUITAR), [[1, 'A'], [3, 'G'], [6, 'E']]);
  eq(capoChart(keyReference('C major'), GUITAR), [[3, 'A'], [5, 'G']]);
  eq(capoChart(keyReference('F major'), GUITAR), [[1, 'E'], [3, 'D'], [5, 'C']]);
  eq(capoChart(keyReference('A minor'), GUITAR), [[5, 'Em'], [7, 'Dm']]);
  eq(capoChart(keyReference('C minor'), GUITAR), [[3, 'Am']]);
  // And across all twelve keys it names those eight and nothing else.
  eq(shapesNamed(GUITAR, false), ['A', 'C', 'D', 'E', 'G']);
  eq(shapesNamed(GUITAR, true), ['Am', 'Dm', 'Em']);
});

Deno.test("a ukulele is offered the ukulele's own keys", () => {
  eq(shapesNamed(UKULELE, false), ['A', 'C', 'D', 'E', 'F', 'G']);
  eq(shapesNamed(UKULELE, true), ['Am', 'C#m', 'Cm', 'Dm', 'Em', 'F#m', 'Fm', 'Gm']);
});

Deno.test('a ukulele row is spelled the way the sheet spells chords', () => {
  // The open minor grip on pitch 1 is stored as D♭m and every chart in the
  // world calls that chord C♯m.
  eq(capoChart(keyReference('D minor'), UKULELE).some((row) => row[0] === 1 && row[1] === 'C#m'), true);
  eq(capoChart(keyReference('B minor'), UKULELE).some((row) => row[0] === 5 && row[1] === 'F#m'), true);
});

Deno.test('no ukulele row is past the 5th fret, nor a guitar row past the 7th', () => {
  for (const key of TWENTY_FOUR) {
    const reference = keyReference(key);
    for (const [fret] of capoChart(reference, UKULELE)) {
      if (fret < 1 || fret > 5) throw new Error(key + ' sends a uke to ' + fret);
    }
    for (const [fret] of capoChart(reference, GUITAR)) {
      if (fret < 1 || fret > 7) throw new Error(key + ' sends a guitar to ' + fret);
    }
  }
});

Deno.test('a key that already sits on an open shape gets no row for itself', () => {
  eq(capoChart(keyReference('F major'), UKULELE).some((row) => row[1] === 'F'), false);
  eq(capoChart(keyReference('G minor'), UKULELE).some((row) => row[1] === 'Gm'), false);
});

/* ==================================================================
   The capo the song asks for — a_capo_that_helps_test.dart
   ================================================================== */

Deno.test('a song in B♭ is a song in G with the capo on 3', () => {
  const found = capoThatHelps(['Bb', 'Eb', 'F', 'Gm'], GUITAR);
  eq(found.fret, 3);
  // Named in the order the song reaches for them, so the line reads the way
  // somebody would say it.
  eq(found.shapes, ['G', 'C', 'D', 'Em']);
});

Deno.test("the horn player's keys come back under the hand", () => {
  // F, B♭ and C is two barres and one open chord; three frets up it is D, G
  // and A.
  const f = capoThatHelps(['F', 'Bb', 'C'], GUITAR);
  eq(f.fret, 3);
  eq(f.shapes, ['D', 'G', 'A']);
  // A blues in B♭ is a blues in A.
  const blues = capoThatHelps(['Bb7', 'Eb7', 'F7'], GUITAR);
  eq(blues.fret, 1);
  eq(blues.shapes, ['A7', 'D7', 'E7']);
});

Deno.test('a minor song takes the lowest fret that does as well', () => {
  // C minor sits on G, D and A shapes at the first fret and on Am, C and G at
  // the third: the same three open shapes and the same one barre, so the capo
  // stays as low as it can.
  const found = capoThatHelps(['Cm', 'Ab', 'Eb', 'Bb'], GUITAR);
  eq(found.fret, 1);
  eq(found.shapes, ['G', 'D', 'A']);
});

Deno.test('a seventh with an open shape counts as one', () => {
  const found = capoThatHelps(['Eb', 'Abmaj7', 'Bb7'], GUITAR);
  eq(found.fret, 1);
  eq(found.shapes, ['D', 'Gmaj7', 'A7']);
});

Deno.test('the F that stops everybody can be capoed away', () => {
  // Am F C G is one barre in four. Five frets up it is Em C G D, which is the
  // move a guitarist makes for somebody who cannot barre yet.
  const found = capoThatHelps(['Am', 'F', 'C', 'G'], GUITAR);
  eq(found.fret, 5);
  eq(found.shapes, ['Em', 'C', 'G', 'D']);
});

Deno.test("it never sends anybody past their instrument's last useful fret", () => {
  for (const song of [['C#', 'F#', 'G#'], ['Ebm', 'Ab', 'Db'], ['B', 'E', 'F#m']]) {
    for (const reading of [GUITAR, UKULELE]) {
      const found = capoThatHelps(song, reading);
      if (found === null) continue;
      if (found.fret < 1 || found.fret > reading.highestCapo) {
        throw new Error(song.join(' ') + ' → fret ' + found.fret);
      }
      if (found.shapes.length < 2) throw new Error(song.join(' ') + ' → one shape');
    }
  }
});

Deno.test('a ukulele is offered ukulele shapes', () => {
  // E♭m, A♭m and B♭m: three barres on either instrument at the nut.
  const song = ['Ebm', 'Abm', 'Bbm'];
  const uke = capoThatHelps(song, UKULELE);
  eq(uke.fret, 1);
  // Gm rings open on a ukulele and has no open shape at all on a guitar,
  // which is the whole difference: one fret up is three open grips.
  eq(uke.shapes, ['Dm', 'Gm', 'Am']);
  const guitar = capoThatHelps(song, GUITAR);
  eq(guitar.fret, 6);
  eq(guitar.shapes, ['Am', 'Dm', 'Em']);
});

Deno.test('a ukulele grip that is a barre is not counted as an open shape', () => {
  // A third of the uke's first-position grips are fully fretted — E♭m is
  // 3, 3, 2, 1 — so a capo offered on the strength of one would be a row
  // calling a barre an open shape. B is 4, 3, 2, 2 and B♭ is 3, 2, 1, 1.
  const fretted = capoThatHelps(['B', 'Eb', 'Bb'], UKULELE);
  eq(fretted.fret, 1);
  eq(fretted.shapes, ['D', 'A']);
});

Deno.test("a ukulele is not sent up a guitar's neck", () => {
  // The first hour of a uke class: G7, C7 and D7. Two of the three ring open
  // already. The seven-fret search turned this into "Capo 7 — C7, F7, G7".
  eq(capoThatHelps(['G7', 'C7', 'D7'], UKULELE), null);
  // F, B♭, C and Dm is the uke's own key, and capo 5 to get away from the one
  // B♭ every uke player already knows is not advice.
  eq(capoThatHelps(['F', 'Bb', 'C', 'Dm'], UKULELE), null);
  // The guitar's own answers are untouched.
  eq(capoThatHelps(['G7', 'C7', 'D7'], GUITAR), null);
  eq(capoThatHelps(['F', 'Bb', 'C'], GUITAR).fret, 3);
  if (UKULELE.highestCapo >= GUITAR.highestCapo) throw new Error('a uke is not shorter');
});

Deno.test('a shape is named the way the sheet beside it names chords', () => {
  const uke = capoThatHelps(['Bb', 'Eb', 'F', 'Dm'], UKULELE);
  eq(uke.fret, 1);
  eq(uke.shapes, ['A', 'D', 'E', 'C#m']);
  // The same grip reached from a sharp key, named the same way.
  const sharp = capoThatHelps(['B', 'E', 'F#', 'D#m'], UKULELE);
  eq(sharp.shapes.includes('C#m'), true);
  eq(sharp.shapes.includes('Dbm'), false);
  // And a flat root stays flat where the flat is the written one: the major
  // 7th on pitch 10 is a B♭maj7 on any chart, not an A♯maj7.
  const flat = capoThatHelps(['Bmaj7', 'Ebm', 'Abm'], UKULELE);
  eq(flat.fret, 1);
  eq(flat.shapes, ['Bbmaj7', 'Dm', 'Gm']);
});

Deno.test('a song already open on a ukulele is left alone', () => {
  // Cm, Fm and Gm all ring open on a uke, so there is nothing to offer — and
  // the same song sends a guitarist up three frets.
  eq(capoThatHelps(['Cm', 'Fm', 'Gm'], UKULELE), null);
  const guitar = capoThatHelps(['Cm', 'Fm', 'Gm'], GUITAR);
  eq(guitar.fret, 3);
  eq(guitar.shapes, ['Am', 'Dm', 'Em']);
});

Deno.test('one chord is not a song', () => {
  eq(capoThatHelps(['Bb'], GUITAR), null);
  eq(capoThatHelps([], GUITAR), null);
});

Deno.test('the page can tell "already open" from "a capo will not help"', () => {
  // Not in the app, which simply says nothing. A page has to say which.
  eq(openAtTheNut(['G', 'C', 'D'], GUITAR), { open: 3, total: 3 });
  eq(openAtTheNut(['C#', 'F#', 'G#'], GUITAR), { open: 0, total: 3 });
});

/* ==================================================================
   Chord names on a chart, and Harte off the analysis
   ================================================================== */

Deno.test('a chord is a chord and a lyric is a lyric', () => {
  for (const token of ['A', 'Am', 'Am7', 'G/B', 'F#m7♭5', 'C6/9', 'Bbsus4', 'D4']) {
    eq(isChordName(token), true, token);
  }
  for (const token of ['I', 'the', 'Oh', 'Amy', 'A:min7', 'x4', '']) {
    eq(isChordName(token), false, token);
  }
});

Deno.test('Harte comes out as something a musician would write', () => {
  eq(chordDisplay('C:maj'), 'C');
  eq(chordDisplay('A:min7'), 'Am7');
  eq(chordDisplay('C:maj/5'), 'C/G');
  eq(chordDisplay('N'), '');
  eq(chordDisplay('Am7'), 'Am7');
  // An unrecognised quality is kept verbatim: showing "C:9(11)" is ugly,
  // showing "C" would be a different chord.
  eq(chordDisplay('C:9(11)'), 'C9(11)');
});

Deno.test('pitchOf reads every name the app can write', () => {
  eq(pitchOf('E#'), 5);
  eq(pitchOf('Cb'), 11);
  eq(pitchOf('H'), null);
  eq(keyIsMinor('Am'), true);
  eq(keyIsMinor('A'), false);
  eq(keyIsMinor('A aeolian'), true);
});

/* ==================================================================
   The other way: a number back into a chord.

   The one function here with no Dart original, so it is tested as the
   inverse it is: every chord of every key goes round the loop and comes
   back itself.
   ================================================================== */

Deno.test('the plain cases read backwards', () => {
  eq(degreeAsChord('1', 'G major'), 'G');
  eq(degreeAsChord('4', 'G major'), 'C');
  eq(degreeAsChord('5', 'G major'), 'D');
  eq(degreeAsChord('2-', 'G major'), 'Am');
  eq(degreeAsChord('♭7', 'G major'), 'F');
  eq(degreeAsChord('b7', 'G major'), 'F', 'a plain b is a flat');
  eq(degreeAsChord('5/7', 'G major'), 'D/F#');
  eq(degreeAsChord('4/1', 'G major'), 'C/G');
  eq(degreeAsChord('2-7', 'G major'), 'Am7');
  eq(degreeAsChord('4maj7', 'G major'), 'Cmaj7');
});

Deno.test('Roman numerals read backwards, with the case saying the quality', () => {
  eq(degreeAsChord('I', 'G major'), 'G');
  eq(degreeAsChord('ii', 'G major'), 'Am');
  eq(degreeAsChord('V', 'G major'), 'D');
  eq(degreeAsChord('ii7', 'G major'), 'Am7');
  eq(degreeAsChord('♭VII', 'G major'), 'F');
  eq(degreeAsChord('vii°', 'G major'), 'F#°');
  // A minor key's numerals count from its own tonic, and vii° is the
  // leading-tone chord a semitone above the key's own VII.
  eq(degreeAsChord('i', 'A minor'), 'Am');
  eq(degreeAsChord('VII', 'A minor'), 'G');
  eq(degreeAsChord('vii°', 'A minor'), 'G#°');
  eq(degreeAsChord('V', 'A minor'), 'E');
});

Deno.test('a minor song reads back from whichever note it counted from', () => {
  eq(degreeAsChord('6-', 'A minor'), 'Am');
  eq(degreeAsChord('4', 'A minor'), 'F');
  eq(degreeAsChord('1-', 'A minor', { fromMinorTonic: true }), 'Am');
  eq(degreeAsChord('♭6', 'A minor', { fromMinorTonic: true }), 'F');
});

Deno.test('a number in a flat key is spelled with flats', () => {
  eq(degreeAsChord('1', 'Eb major'), 'Eb');
  eq(degreeAsChord('4', 'Eb major'), 'Ab');
  eq(degreeAsChord('6-', 'Eb major'), 'Cm');
  eq(degreeAsChord('5/7', 'F major'), 'C/E');
});

Deno.test('every chord of every key goes round the loop and comes back', () => {
  const qualities = ['', 'm', '7', 'm7', 'maj7', '°', 'sus4', '6', '9'];
  for (const key of TWENTY_FOUR) {
    for (const roman of [false, true]) {
      for (const fromMinorTonic of [false, true]) {
        for (const degree of [0, 2, 3, 4, 5, 7, 8, 9, 10, 11]) {
          for (const quality of qualities) {
            // The one collision, and it is in the notation rather than in the
            // port — see the test below.
            if (roman && keyIsMinor(key) && degree === 10 && quality === '°') continue;
            const root = noteName((pitchOf(keyReference(key).tonic) + degree) % 12, false);
            const chord = spellInKey(root + quality, key);
            const number = chordAsDegree(chord, key, { roman, fromMinorTonic });
            if (number === null) throw new Error(chord + ' in ' + key + ' has no number');
            const back = degreeAsChord(number, key, { fromMinorTonic });
            eq(back, chord, chord + ' in ' + key + ' via ' + number);
          }
        }
      }
    }
  }
});

Deno.test('vii° in a minor key is the leading-tone chord', () => {
  // The one place the loop cannot close, and it is the notation's doing, not
  // the port's. A minor key writes the leading-tone chord vii° with no sharp
  // on it, the way every harmony textbook does — and the diminished chord on
  // the key's own flat 7, a semitone below, has nowhere else to go and is
  // written vii° too. Read back, vii° is the leading-tone chord, because that
  // is the one anybody writing it means.
  eq(chordAsDegree('B°', 'C minor', { roman: true }), 'vii°');
  eq(chordAsDegree('Bb°', 'C minor', { roman: true }), 'vii°');
  eq(degreeAsChord('vii°', 'C minor'), 'B°');
  // Nashville numbers have no such trouble: by default they count a minor
  // key from its relative major — C minor against E♭ — where nothing is
  // assumed about anybody's seventh and the two chords are two numbers.
  eq(chordAsDegree('B°', 'C minor'), '♭6°');
  eq(chordAsDegree('Bb°', 'C minor'), '5°');
  eq(degreeAsChord('♭6°', 'C minor'), 'B°');
  eq(degreeAsChord('5°', 'C minor'), 'Bb°');
});

Deno.test('a slash chord goes round the loop too', () => {
  for (const key of ['G major', 'Eb major', 'A minor', 'F# minor']) {
    for (const chord of ['1/3', '4/1', '5/7', '6-/1']) {
      const letters = degreeAsChord(chord, key);
      eq(chordAsDegree(letters, key), chord, letters + ' in ' + key);
    }
  }
});

Deno.test('a word is not a number', () => {
  eq(isDegreeName('1'), true);
  eq(isDegreeName('2-7'), true);
  eq(isDegreeName('♭VII'), true);
  eq(isDegreeName('vii°'), true);
  eq(isDegreeName('5/7'), true);
  eq(isDegreeName('the'), false);
  eq(isDegreeName('8'), false);
  eq(isDegreeName('G'), false);
  eq(degreeAsChord('the', 'G major'), null);
});

/* ==================================================================
   Reading a chart somebody pasted, and giving it back
   ================================================================== */

const move = (semitones, key) => (chord) => chordAsPlayed(chord, semitones, key);
const round = (text, semitones, key, facts) =>
  rowsAsText(layoutChart(readChart(text), move(semitones, key), facts ?? {}));

Deno.test('chords over words come back over the same words', () => {
  const chart = [
    '       G          D',
    'I left the porch light on',
  ].join('\n');
  eq(round(chart, 2, 'G major'), [
    '       A          E',
    'I left the porch light on',
  ].join('\n'));
});

Deno.test('a longer chord name pushes the next one right', () => {
  // G up one is A♭ major, so both names grow a character. The second cannot
  // start where it started or it would run into the first.
  const chart = ['G D', 'la la'].join('\n');
  eq(round(chart, 1, 'G'), ['Ab Eb', 'la la'].join('\n'));
});

Deno.test('ChordPro comes back as ChordPro', () => {
  eq(round('[G]I left the [D]porch light on', 2, 'G major'),
    '[A]I left the [E]porch light on');
  // A bracket holding something that is not a chord is left in the words.
  eq(round('[G]Round it goes [x4]', 2, 'G'), '[A]Round it goes [x4]');
});

Deno.test('a row of chords on its own keeps its spacing', () => {
  eq(round('G   C   D', 2, 'G'), 'A   D   E');
  eq(round('Intro: G  C  D', 2, 'G'), 'Intro: A  D  E');
  eq(round('| G | C | D | G |', 2, 'G'), '| A | D | E | A |');
});

Deno.test('a line of words is never mistaken for chords', () => {
  // "A" is a chord and so is "Am" — but the whole line has to agree, which is
  // what keeps "Am I the only one" a lyric.
  eq(round('Am I the only one', 2, 'C'), 'Am I the only one');
  eq(round('A man walks in', 2, 'C'), 'A man walks in');
});

Deno.test('nothing on the page is ever lost', () => {
  const chart = [
    '[Verse 1]',
    '{tempo: 96}',
    'e|--0--2--3--',
    '',
    'Play it twice and stop',
  ].join('\n');
  eq(round(chart, 3, 'C'), chart);
});

Deno.test('the key line moves with the chords, and a capo says so', () => {
  const chart = ['Key: G', '', 'G  C  D'].join('\n');
  eq(round(chart, 2, 'G', { key: 'A', capo: 0 }), ['Key: A', '', 'A  D  E'].join('\n'));
  // A capo somebody put on has to be written down or the chart is wrong, and
  // it goes directly under the key it belongs to.
  eq(round(chart, 2, 'G', { key: 'A', capo: 3 }),
    ['Key: A', 'Capo 3', '', 'A  D  E'].join('\n'));
  // A capo that came off takes its line with it.
  const capoed = ['{key: G}', '{capo: 2}', '', 'G  C  D'].join('\n');
  eq(round(capoed, 0, 'G', { key: 'G', capo: 0 }), ['{key: G}', '', 'G  C  D'].join('\n'));
});

Deno.test('what the chart says about itself', () => {
  const chart = readChart(['{title: Porch Light}', 'Key: Bb', 'Capo 2', '', 'Bb Eb F'].join('\n'));
  eq(chartKey(chart), 'Bb');
  eq(chartCapoFrets(chart), 2);
  eq(chart.chords, ['Bb', 'Eb', 'F']);
  // A chart that wrote a sentence where the key goes has no key as far as
  // this is concerned, which beats counting numbers from a word.
  eq(chartKey(readChart('Key: whatever feels right')), null);
  eq(chartCapoFrets(readChart('Capo: none at all')), 0);
});

Deno.test('a chart pasted out of a web page keeps its columns', () => {
  // Non-breaking spaces hold the alignment when HTML would collapse ordinary
  // ones, and every column here is counted in characters.
  const chart = 'G\u00a0\u00a0\u00a0\u00a0C\nla la';
  eq(round(chart, 0, 'G'), 'G    C\nla la');
});

Deno.test('numbers can be read off a chart as well as written onto one', () => {
  const chart = ['   1     4', 'la la la la'].join('\n');
  const rows = layoutChart(
    readChart(chart, { degrees: true }),
    (token) => degreeAsChord(token, 'G major') ?? token,
  );
  eq(rowsAsText(rows), ['   G     C', 'la la la la'].join('\n'));
  // And a lyric line of one word is not a Roman numeral.
  const lyric = readChart('I', { degrees: true });
  eq(lyric.chords, []);
});

Deno.test('a whole chart goes to numbers and back', () => {
  const chart = [
    'Key: G',
    '',
    '       G          D',
    'I left the porch light on',
    '',
    'Em  C  G  D',
  ].join('\n');
  const numbers = rowsAsText(layoutChart(
    readChart(chart),
    (chord) => chordAsDegree(chord, 'G major') ?? chord,
  ));
  eq(numbers, [
    'Key: G',
    '',
    '       1          5',
    'I left the porch light on',
    '',
    '6-  4  1  5',
  ].join('\n'));
  const letters = rowsAsText(layoutChart(
    readChart(numbers, { degrees: true }),
    (token) => degreeAsChord(token, 'G major') ?? token,
  ));
  eq(letters, chart);
});
