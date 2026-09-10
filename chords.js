/* The free chord tool.

   Posts a recording to the analyze-public Edge Function and draws what comes
   back. Everything here is deliberately small: no framework, no build step,
   no dependency that could stop resolving in two years on a static site
   nobody is watching.

   The endpoint does the interesting parts — the quota, the salted requester
   hash, and the decision not to store anything. This file is a form and a
   renderer. */

const ENDPOINT =
  'https://gzcoclsfvazfhcheefhz.supabase.co/functions/v1/analyze-public';

const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const pick = document.getElementById('pick');
const working = document.getElementById('working');
const workingNote = document.getElementById('working-note');
const problem = document.getElementById('problem');
const result = document.getElementById('result');
const keyEl = document.getElementById('key');
const progEl = document.getElementById('prog');
const chart = document.getElementById('chart');
const copyBtn = document.getElementById('copy');
const shareBtn = document.getElementById('share');
const againBtn = document.getElementById('again');
const gate = document.getElementById('gate');
const gateBack = document.getElementById('gate-back');

/* Harte notation into what a musician writes.

   The service returns "C:maj", "A:min", "G:7". Nobody writes those on a chart.
   Kept to the qualities that actually turn up — anything unrecognised falls
   through with its quality appended rather than being silently dropped, so an
   odd chord looks odd instead of looking wrong. */
const QUALITIES = {
  maj: '',
  min: 'm',
  '7': '7',
  maj7: 'maj7',
  min7: 'm7',
  hdim7: 'm7♭5',
  dim: 'dim',
  dim7: 'dim7',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  min6: 'm6',
  maj6: '6',
  '9': '9',
  min9: 'm9',
  maj9: 'maj9',
};

/* ------------------------------------------------------------------
   A link that carries the chart, and stores nothing anywhere.

   The whole sheet is packed into the URL fragment. That is a deliberate
   choice over saving it on the server and handing back a short id:

     * Nothing is stored, so there is nothing to moderate, nothing to
       retain, nothing to delete on request, and no cost per share. A
       tool that hosts what strangers upload is a different product with
       a different legal surface.
     * A fragment never reaches the server at all — browsers do not send
       it — so a shared chart is private between whoever has the link.
     * It cannot rot. There is no row to expire and no cleanup job.

   The cost is a long URL. Deflate plus base64url keeps a normal song
   inside two thousand characters, which every browser and messaging app
   handles without complaint.
   ------------------------------------------------------------------ */
let lastSheet = null;

const b64 = {
  to(bytes) {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(b);
    return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  from(text) {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded + '==='.slice((padded.length + 3) % 4));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  },
};

async function squeeze(bytes, mode) {
  /* CompressionStream is in every current browser and absent from a few
     older ones. Where it is missing the link is simply longer, rather
     than the feature being missing. */
  const Ctor = mode === 'in'
    ? globalThis.CompressionStream
    : globalThis.DecompressionStream;
  if (!Ctor) return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (_) {
    return null;
  }
}

async function packSheet(sheet) {
  const raw = new TextEncoder().encode(JSON.stringify(sheet));
  const squeezed = await squeeze(raw, 'in');
  return squeezed ? 'z' + b64.to(squeezed) : 'j' + b64.to(raw);
}

async function unpackSheet(text) {
  const bytes = b64.from(text.slice(1));
  const raw = text[0] === 'z' ? await squeeze(bytes, 'out') : bytes;
  if (!raw) return null;
  return JSON.parse(new TextDecoder().decode(raw));
}

function chordName(raw) {
  if (!raw || raw === 'N') return 'N.C.';
  const [rootPart, qualityPart] = raw.split(':');
  // "C/5" — an inversion over a scale degree. The bass note is a different
  // question from the chord, and showing "/5" would be unreadable, so the
  // chord is named and the inversion left off.
  const root = rootPart.split('/')[0];
  if (!qualityPart) return root;
  const quality = qualityPart.split('/')[0];
  const suffix = QUALITIES[quality];
  return root + (suffix === undefined ? quality : suffix);
}

function clock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return minutes + ':' + String(whole % 60).padStart(2, '0');
}

/* Consecutive repeats collapsed into one.

   A chord held for eight seconds comes back as several segments. Reading them
   as separate events makes a simple song look frantic, and the thing a person
   came here for is the shape: G, D, Em, C. */
function collapse(chords) {
  const out = [];
  for (const c of chords) {
    const name = chordName(c.chord);
    const last = out[out.length - 1];
    if (last && last.name === name) {
      last.end = c.end;
      continue;
    }
    out.push({ name, start: c.start, end: c.end });
  }
  return out;
}

let lastCopyText = '';

function show(el, on) {
  el.hidden = !on;
}

function fail(message) {
  show(working, false);
  show(result, false);
  problem.textContent = message;
  show(problem, true);
}

function render(data) {
  const collapsed = collapse(data.chords || []);
  if (collapsed.length === 0) {
    fail('No chords were found in that recording.');
    return;
  }

  keyEl.textContent = data.key || 'not sure';

  /* The progression: the first few distinct chords, which is what somebody
     asks for when they ask what a song is. Not every chord in the song —
     that is the chart below, and leading with it would bury the answer. */
  const distinct = [];
  for (const c of collapsed) {
    if (!distinct.includes(c.name) && c.name !== 'N.C.') distinct.push(c.name);
    if (distinct.length === 6) break;
  }
  progEl.textContent = distinct.join('  ·  ');

  chart.innerHTML = '';
  for (const c of collapsed) {
    const row = document.createElement('div');
    row.className = 'chart-row';

    const at = document.createElement('span');
    at.className = 'chart-at';
    at.textContent = clock(c.start);

    const name = document.createElement('span');
    name.className = 'chart-chord';
    if (c.name === 'N.C.') name.classList.add('quiet');
    name.textContent = c.name;

    const held = document.createElement('span');
    held.className = 'chart-held';
    held.textContent = Math.max(1, Math.round(c.end - c.start)) + 's';

    row.append(at, name, held);
    chart.append(row);
  }

  lastCopyText = collapsed
    .map((c) => clock(c.start) + '  ' + c.name)
    .join('\n');
  lastSheet = { k: data.key || '', c: collapsed.map(
    (c) => [c.name, Math.round(c.start * 10) / 10, Math.round(c.end * 10) / 10]) };

  show(working, false);
  show(problem, false);
  show(result, true);
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function send(file) {
  if (!file) return;
  if (file.size > 24 * 1024 * 1024) {
    fail('That file is over 24MB. A normal song is well under it.');
    return;
  }

  show(problem, false);
  show(result, false);
  show(gate, false);
  show(working, true);
  workingNote.textContent = 'Listening…';

  /* Said out loud because it takes about a minute and a silent minute reads
     as a broken page. The wording changes so the page is visibly still alive
     rather than showing one frozen sentence. */
  const notes = [
    'Listening…',
    'Working out the harmony…',
    'Naming the chords…',
    'Almost there…',
  ];
  let step = 0;
  const ticking = setInterval(() => {
    step += 1;
    workingNote.textContent = notes[Math.min(step, notes.length - 1)];
  }, 12000);

  try {
    const form = new FormData();
    form.append('file', file, file.name || 'song');
    const response = await fetch(ENDPOINT, { method: 'POST', body: form });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // The limit is not a failure and must not look like one. Somebody who
      // has used their free songs has shown the only thing worth knowing
      // about them — they have music and they want to know what is in it —
      // and greeting that with a red error box is the wrong answer to the
      // best moment this page gets.
      if (body && body.limit_reached) {
        show(working, false);
        show(result, false);
        show(problem, false);
        show(gate, true);
        gate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      fail(
        (body && body.error) ||
          'That did not work. Try again in a moment.'
      );
      return;
    }
    render(body);
  } catch (error) {
    // Almost always the network rather than us. Said plainly, because "failed
    // to fetch" is not a sentence anybody can act on.
    fail('That upload did not reach us. Check your connection and try again.');
  } finally {
    clearInterval(ticking);
  }
}

pick.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => send(fileInput.files[0]));

drop.addEventListener('submit', (event) => event.preventDefault());
drop.addEventListener('click', (event) => {
  if (event.target === pick) return;
  fileInput.click();
});

for (const name of ['dragenter', 'dragover']) {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.add('over');
  });
}
for (const name of ['dragleave', 'drop']) {
  drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.remove('over');
  });
}
drop.addEventListener('drop', (event) => {
  const file = event.dataTransfer && event.dataTransfer.files[0];
  send(file);
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastCopyText);
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy the chords'; }, 1800);
  } catch (error) {
    copyBtn.textContent = 'Select and copy above';
  }
});

gateBack.addEventListener('click', () => {
  show(gate, false);
  document.getElementById('tool').scrollIntoView({ behavior: 'smooth' });
});

againBtn.addEventListener('click', () => {
  fileInput.value = '';
  show(result, false);
  show(problem, false);
  document.getElementById('tool').scrollIntoView({ behavior: 'smooth' });
});

shareBtn.addEventListener('click', async () => {
  if (!lastSheet) return;
  try {
    const link = location.origin + location.pathname + '#s=' + await packSheet(lastSheet);
    await navigator.clipboard.writeText(link);
    history.replaceState(null, '', '#s=' + await packSheet(lastSheet));
    shareBtn.textContent = 'Link copied';
    setTimeout(() => { shareBtn.textContent = 'Copy a link to this'; }, 1800);
  } catch (_) {
    shareBtn.textContent = 'Could not copy the link';
    setTimeout(() => { shareBtn.textContent = 'Copy a link to this'; }, 2200);
  }
});

/* Somebody arriving on a shared link sees the chart, not the drop zone.
   This is the whole point of the feature: the person who receives it did
   not upload anything and should not be asked to. */
(async function openShared() {
  const match = location.hash.match(/^#s=(.+)$/);
  if (!match) return;
  try {
    const sheet = await unpackSheet(decodeURIComponent(match[1]));
    if (!sheet || !Array.isArray(sheet.c) || sheet.c.length === 0) return;
    // The drop zone, not the whole section — `#result` lives inside `#tool`,
    // so hiding the section hides the chart it was meant to reveal.
    show(drop, false);
    // Handed back as `chord`, the field `collapse` reads. `chordName` is
    // idempotent on an already-formatted name — "Gm" has no colon, so it
    // comes back out as "Gm" — which is what lets the chart be rebuilt
    // through the same path that drew it in the first place rather than a
    // second renderer that would drift from this one.
    render({
      key: sheet.k,
      chords: sheet.c.map(([name, start, end]) => ({ chord: name, start, end })),
    });
  } catch (_) {
    /* A truncated or edited link falls through to the normal tool, which
       is a working page rather than an error. */
  }
})();
