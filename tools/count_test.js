/* The arrival chain, tested.

   A flier code has to survive four hops — the address bar, localStorage,
   the beacon, and the link into the app — and it has never once made it
   all the way. Nothing here needs installing beyond Deno, and the site
   itself still has no build step: this file is run by hand, from the
   repository root.

       deno test --allow-read tools/count_test.js

   count.js is a plain script, not a module, so it is read as text and
   run with its globals handed in. That is deliberate — the test runs the
   same bytes the browser does, rather than a copy that can drift.

   No test library, for the same reason the site has no framework: three
   assertions written out here cost less than a dependency that has to
   still resolve in two years. */

function assertEquals(got, want, why) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${why || 'not equal'}\n  got  ${a}\n  want ${b}`);
}

function assertStringIncludes(got, needle, why) {
  if (!String(got).includes(needle)) {
    throw new Error(`${why || 'missing'}\n  ${got}\n  does not contain ${needle}`);
  }
}

function assertFalse(got, why) {
  if (got) throw new Error(why || 'expected false');
}

const SOURCE = await Deno.readTextFile(
  new URL('../count.js', import.meta.url));

/* A browser, in about forty lines. */
function run({ href, stored = null, page = 'home', links = [],
               storageThrows = false }) {
  const sent = [];
  const store = new Map();
  if (stored !== null) store.set('colabroom_code', stored);

  const localStorage = {
    getItem(k) {
      if (storageThrows) throw new Error('blocked');
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      if (storageThrows) throw new Error('blocked');
      store.set(k, v);
    },
  };

  const nodes = links.map((url) => ({
    href: url,
    handlers: [],
    addEventListener(_, fn) { this.handlers.push(fn); },
    click() { for (const fn of this.handlers) fn(); },
  }));

  const document = {
    currentScript: {
      getAttribute: (name) => (name === 'data-page' ? page : null),
    },
    querySelector: () => null,
    /* count.js asks for the links that lead to the app; the stub is
       handed exactly those, and count.js decides what to do with each. */
    querySelectorAll: () => nodes,
  };

  const win = {};
  const fetchStub = (url) => { sent.push(url); return Promise.resolve(); };

  new Function('window', 'document', 'location', 'localStorage', 'fetch',
    SOURCE)(win, document, { href }, localStorage, fetchStub);

  return { sent, nodes, store, api: win.CoLab };
}

const HOME = 'https://colabroom.com/';
const APP = 'https://app.colabroom.com/';
const MAIL = 'mailto:beta@colabroom.com?subject=CoLabRoom%20beta';

Deno.test('a code on the address is kept, sent, and carried to the app', () => {
  const { sent, nodes, store, api } = run({
    href: HOME + '?c=ORL-Alley',
    links: [APP, MAIL],
  });

  assertEquals(store.get('colabroom_code'), 'orl-alley',
    'the code is remembered in lower case for the next visit');
  assertEquals(api.code, 'orl-alley');

  assertEquals(sent.length, 1, 'one beacon on load, and only one');
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'c=orl-alley');
  assertStringIncludes(sent[0], 'page=home');

  assertEquals(nodes[0].href, APP + '?from=orl-alley',
    'the app link carries the code onward — this is the hop that has '
    + 'never worked, because the button used to be a mailto');
  assertEquals(nodes[1].href, MAIL, 'a mailto is left exactly as it was');
});

Deno.test('every link towards the app counts as clicked_app', () => {
  const { sent, nodes } = run({ href: HOME, links: [APP, MAIL] });
  assertEquals(sent.length, 1);
  nodes[0].click();
  nodes[1].click();
  assertEquals(sent.length, 3);
  assertStringIncludes(sent[1], 'step=clicked_app');
  assertStringIncludes(sent[2], 'step=clicked_app');
});

Deno.test('a remembered code carries on, but the page load is not a second arrival', () => {
  const { sent, nodes } = run({
    href: HOME + 'takes.html',
    stored: 'yt-chords-01',
    page: 'takes',
    links: [APP],
  });

  /* A step that carries a code is written to `arrivals`, and
     `arrival_report` sums those. So the second, third and sixth page
     this person reads must not each look like somebody new walking in
     off that video — or a board whose visitors browse beats a board
     whose visitors sign up. */
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'page=takes');
  assertFalse(sent[0].includes('c=yt-chords-01'),
    'a code read back out of storage is the same person still reading, '
    + 'not another arrival');

  /* Everything the visitor actually does still says where they came
     from, which is the half that makes the code worth keeping. */
  assertEquals(nodes[0].href, APP + '?from=yt-chords-01',
    'the link into the app still carries it');
  nodes[0].click();
  assertStringIncludes(sent[1], 'step=clicked_app');
  assertStringIncludes(sent[1], 'c=yt-chords-01',
    'going to the app is a thing they did, and it counts for the board');
});

Deno.test('a code on this load is an arrival, and counts as one', () => {
  const { sent, nodes } = run({
    href: HOME + '?c=orl-alley',
    page: 'home',
    links: [APP],
  });
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'c=orl-alley',
    'the one load where somebody really did walk through that door');
  nodes[0].click();
  assertStringIncludes(sent[1], 'c=orl-alley');
});

Deno.test('no code means no code — nothing is invented', () => {
  const { sent, nodes, api } = run({ href: HOME, links: [APP] });
  assertEquals(api.code, '');
  assertFalse(sent[0].includes('&c='));
  assertStringIncludes(sent[0], 'step=opened');
  assertEquals(nodes[0].href, APP, 'the link is untouched');
});

Deno.test('anything that is not a plain code is ignored', () => {
  for (const bad of ['../etc', 'a b', 'x'.repeat(33), 'code!', '']) {
    const { sent, store } = run({
      href: HOME + '?c=' + encodeURIComponent(bad),
      links: [],
    });
    assertEquals(store.has('colabroom_code'), false,
      'refused rather than stored: ' + JSON.stringify(bad));
    assertFalse(sent[0].includes('&c='),
      'refused rather than sent: ' + JSON.stringify(bad));
  }
});

Deno.test('a page name that is not a plain slug is dropped', () => {
  const { sent } = run({ href: HOME, page: 'not a slug', links: [] });
  assertFalse(sent[0].includes('page='));
});

Deno.test('a browser with storage blocked still counts and still works', () => {
  const { sent, nodes, api } = run({
    href: HOME + '?c=flier-orl',
    storageThrows: true,
    links: [APP],
  });
  assertEquals(api.code, '', 'no code survives, and nothing throws');
  assertStringIncludes(sent[0], 'step=opened');
  assertEquals(nodes[0].href, APP);
});

Deno.test('the beacon is a GET with no identifier on it', () => {
  const { sent } = run({ href: HOME + '?c=hn-tool', page: 'home', links: [] });
  const url = new URL(sent[0]);
  assertEquals(url.pathname.endsWith('/note'), true);
  assertEquals([...url.searchParams.keys()].sort(),
    ['c', 'page', 'step'],
    'three parameters and no fourth: a step, a place and a page. '
    + 'Nothing here names a person.');
});
