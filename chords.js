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
const sharedNote = document.getElementById('shared-note');

/* Set when the page was opened on a link somebody sent, which changes what
   almost every control on it should say. */
let arrivedShared = false;

/* ------------------------------------------------------------------
   Where people stop.

   The tool has been live for days and the database holds one requester
   and three analyses, all of them ours on the day it shipped. So the
   question this answers is not "which step loses people" yet — it is
   the plainer one of whether anybody arrives at all, which right now
   nothing on this site can answer.

   Every step is recorded from here rather than some from the server,
   because a funnel whose steps are measured by different mechanisms
   cannot be compared across steps, and comparing across steps is the
   entire purpose of a funnel.

   `keepalive` matters on the ones that precede a navigation: without
   it, following a link cancels the request that was recording that the
   link was followed.

   **A GET, deliberately, for a call that changes a number.** The live
   function treats every POST as an audio upload and claims a slot from
   the daily quota *before* it looks at the body — so a POST beacon
   shipped a moment before the function is redeployed would spend one of
   a visitor's five free songs on loading the page. It refuses anything
   that is not a POST first, without touching the quota, which makes GET
   the one shape that is harmless against both the old deployment and
   the new one. Correctness under a version skew beats REST here.
   ------------------------------------------------------------------ */
/* Where this visitor came from.

   A flier on a board, a card on a merch table, a link under a video:
   each carries ?c=<code>. The page keeps the code for the visit and
   for next time, every step below carries it, and the link onward to
   the app carries it as ?from=, so an account made there can say which
   board it came from. The code names a place, never a person. */
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
    fetch(ENDPOINT + '/note?step=' + encodeURIComponent(step)
        + (CODE ? '&c=' + encodeURIComponent(CODE) : ''), {
      cache: 'no-store',
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    /* Measurement never breaks the page it measures. */
  }
}
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

/* `retry` is the file to send again when the failure was ours or the
   network's rather than the recording's. Choosing the same file in the
   picker does nothing in most browsers (no change event for an unchanged
   value), so "try that again" needs a button that really does it. It is
   sent as a retry, which is not a second file chosen, and the button goes
   quiet on the first tap so a double tap cannot spend two songs. */
function fail(message, retry) {
  note('analyzed_fail');
  show(working, false);
  show(result, false);
  problem.textContent = message;
  if (retry) {
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'cta quiet problem-again';
    again.textContent = 'Try again';
    again.addEventListener('click', () => {
      if (again.disabled) return;
      again.disabled = true;
      send(retry, { retrying: true });
    });
    problem.append(again);
  }
  show(problem, true);
}

/* The number in the line under the heading, from the server's own.

   The page is written with today's number in it, because the limit should
   be said before anybody chooses a file. The real number is a database
   row that can be raised for a launch day without touching this site
   (public_tool_budget, app migration 0178), and every reply that has one
   carries it, so the line is put right the first time the page hears it
   and cannot disagree with the gate after that. */
function sayTheLimit(dailyLimit) {
  const el = document.getElementById('daily-limit');
  if (!el || !Number.isInteger(dailyLimit) || dailyLimit <= 0) return;
  el.textContent = String(dailyLimit);
}

/* When the free songs come back, in the visitor's own clock.

   The server's day ends at midnight UTC, which is the evening before in
   Florida and the next morning in Tokyo. "Midnight UTC" is arithmetic
   a musician should not have to do, so the page says the local time the
   server's `reset_at` falls on, and only says UTC when it has no instant
   to go on. */
function whenTheyComeBack(resetAt) {
  const at = resetAt ? new Date(resetAt) : null;
  if (!at || isNaN(at.getTime())) return 'midnight UTC';
  /* Always within the next day, so a local midnight is the coming one and
     needs no date beside it. */
  if (at.getHours() === 0 && at.getMinutes() === 0) return 'midnight, your time';
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return at.toDateString() === new Date().toDateString()
    ? time + ' your time'
    : time + ' tomorrow, your time';
}

/* The free tool's two ways of saying "not today", both drawn as the gate
   rather than the problem box, because neither is a failure: one is this
   visitor's share, the other is our budget for the whole day. */
function stopForToday(body) {
  const when = whenTheyComeBack(body.reset_at);
  const lead = gate.querySelector('.gate-lead');
  sayTheLimit(body.daily_limit);
  if (body.budget_reached) {
    lead.textContent = 'The free tool is resting until ' + when
      + '. Your song is fine; try it again then.';
  } else {
    const limit = Number.isInteger(body.daily_limit) && body.daily_limit > 0
      ? body.daily_limit
      : null;
    lead.textContent = (limit
      ? "That's your " + limit + ' songs for today.'
      : "That's all your free songs for today.")
      + ' They come back at ' + when + '.';
  }
  show(working, false);
  show(result, false);
  show(problem, false);
  show(gate, true);
  /* The server counts budget_reached itself and says so with `counted`;
     it does not count limit_reached. Counted once either way. */
  if (!body.counted) note(body.budget_reached ? 'budget_reached' : 'limit_reached');
  gate.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function render(data) {
  const collapsed = collapse(data.chords || []);
  if (collapsed.length === 0) {
    fail('No chords were found in that recording.');
    return;
  }

  /* When the finder came out close between two keys it says both, the
     likelier first, rather than pretending to be sure of one. Relative
     keys are the usual pair: G major, or E minor. */
  keyEl.textContent = data.key
    ? (data.key_runner_up ? data.key + ', or ' + data.key_runner_up : data.key)
    : 'not sure';

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
  /* `r` is the other key when there was one. A link made before it existed
     has none, and opens as a key on its own, which is what it said then. */
  lastSheet = { k: data.key || '', r: data.key_runner_up || '', c: collapsed.map(
    (c) => [c.name, Math.round(c.start * 10) / 10, Math.round(c.end * 10) / 10]) };

  show(working, false);
  show(problem, false);
  show(result, true);
  note('analyzed_ok');
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* `retrying` is set only by Try again. The funnel's first step is a person
   choosing a file, and the same file sent again after a cold start is not
   another one: counting it would inflate the step by exactly the failures
   it is compared against. */
async function send(file, { retrying = false } = {}) {
  if (!file) return;
  if (!retrying) note('chose_file');
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
      // best moment this page gets. A day whose budget is spent is not a
      // failure either, and not theirs: until 24 September 2026 it fell
      // through to the problem box and was counted as a failed analysis.
      if (body && (body.limit_reached || body.budget_reached)) {
        stopForToday(body);
        return;
      }
      fail(
        (body && body.error) ||
          'That did not work. Try again in a moment.',
        body && body.try_again ? file : null
      );
      return;
    }
    sayTheLimit(body && body.daily_limit);
    render(body);
  } catch (error) {
    // Almost always the network rather than us. Said plainly, because "failed
    // to fetch" is not a sentence anybody can act on, and the same file is
    // one tap from going again.
    fail('That upload did not reach us. Check your connection and try again.', file);
  } finally {
    clearInterval(ticking);
  }
}

pick.addEventListener('click', () => fileInput.click());
/* The file is taken and the picker emptied at once. A picker still holding
   a file fires no change event when the same one is chosen again, so after
   "still waking up, try that again" choosing it again did nothing at all.
   The File itself stays readable after the input is cleared, and send()
   keeps it for the Try again button. */
fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  send(file);
});

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
  note('copied_text');
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
  // `show(drop, true)` is not redundant. Arriving on a shared link hides the
  // drop zone, so before this line the button emptied the page instead of
  // resetting it — the one path through the tool that had never been walked
  // from the start.
  if (arrivedShared) {
    note('made_own');
    arrivedShared = false;
    history.replaceState(null, '', location.pathname);
    againBtn.textContent = 'Try another song';
    againBtn.classList.add('quiet');
    shareBtn.classList.remove('quiet');
    show(sharedNote, false);
  }
  fileInput.value = '';
  show(result, false);
  show(problem, false);
  show(drop, true);
  document.getElementById('tool').scrollIntoView({ behavior: 'smooth' });
});

shareBtn.addEventListener('click', async () => {
  if (!lastSheet) return;
  note('shared_link');
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
    note('opened_shared');
    arrivedShared = true;
    show(drop, false);
    show(sharedNote, true);

    /* The page still greeted them with "Drop in a song. Get the chords back."
       — an instruction for a job already done, addressed to somebody who did
       not do it. Whoever opens one of these is the most interested visitor
       this site gets: they were sent chords by a musician they know. Say what
       they are looking at, then offer the only thing they could want next. */
    const heading = document.querySelector('.hero h1');
    const sub = document.querySelector('.hero p');
    if (heading) heading.innerHTML = 'Somebody sent you<br>these chords.';
    if (sub) sub.textContent = 'Free, from a recording, in about a minute.';

    againBtn.textContent = 'Do this with your own song';
    againBtn.classList.remove('quiet');
    shareBtn.classList.add('quiet');
    // Handed back as `chord`, the field `collapse` reads. `chordName` is
    // idempotent on an already-formatted name — "Gm" has no colon, so it
    // comes back out as "Gm" — which is what lets the chart be rebuilt
    // through the same path that drew it in the first place rather than a
    // second renderer that would drift from this one.
    render({
      key: sheet.k,
      key_runner_up: typeof sheet.r === 'string' ? sheet.r : '',
      chords: sheet.c.map(([name, start, end]) => ({ chord: name, start, end })),
    });
  } catch (_) {
    /* A truncated or edited link falls through to the normal tool, which
       is a working page rather than an error. */
  }
})();

/* The page was opened, and the two ways somebody leaves it towards the
   product. `clicked_app` and `clicked_onward` are separate because they
   are different levels of interest: one is "show me more about this",
   the other is "I want the thing". */
note('opened');

for (const link of document.querySelectorAll('.onward')) {
  link.addEventListener('click', () => note('clicked_onward'));
}
for (const link of document.querySelectorAll('a[href*="app.colabroom.com"], a[href^="mailto:beta@"]')) {
  link.addEventListener('click', () => note('clicked_app'));
  // The code rides on to the app, where an account claims it.
  if (CODE && link.href.includes('app.colabroom.com')) {
    try {
      const onward = new URL(link.href);
      onward.searchParams.set('from', CODE);
      link.href = onward.toString();
    } catch (_) {
      /* A link that cannot be rewritten still works as it was. */
    }
  }
}
