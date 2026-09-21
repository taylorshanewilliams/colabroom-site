/* Where a visitor came from, and that they arrived.

   This used to live inside chords.js, which only two of the nine pages
   load. So a flier QR, a link under a video or a Show HN post pointed at
   the front door dropped its `?c=` code on the floor: the code was never
   kept, never carried onward to the app, and the arrival was never
   counted. That is most of why the arrivals report has never returned a
   single row since the day it was built.

   Now every marketing page loads this, and the tool keeps its own file
   for the parts that are about the tool.

   There is no identifier of any kind in here. No cookie, no visitor id,
   no fingerprint, nothing that could be joined back to a person. A code
   names a board, a venue or a video; a page name names a page. Both are
   things we chose and printed ourselves. */
(function () {
  /* The same Edge Function the tool posts a recording to. Written out
     again rather than shared, so a page that only counts needs nothing
     else on it. */
  var ENDPOINT =
    'https://gzcoclsfvazfhcheefhz.supabase.co/functions/v1/analyze-public';

  /* Which page this is, said by the page rather than read off the
     address. GitHub Pages serves both /chords and /chords.html, and a
     404 is served at whatever was mistyped, so the address is the one
     thing here that cannot be trusted to name the page. */
  var page = (function () {
    var tag = document.currentScript
      || document.querySelector('script[data-page]');
    var name = (tag && tag.getAttribute('data-page')) || '';
    return /^[a-z0-9-]{1,24}$/.test(name) ? name : '';
  })();

  /* Where this visitor came from.

     A flier on a board, a card on a merch table, a link under a video:
     each carries ?c=<code>. The page keeps the code for the visit and
     for next time, every step below carries it, and the link onward to
     the app carries it as ?from=, so an account made there can say which
     board it came from. The code names a place, never a person. */
  var code = (function () {
    try {
      var raw = new URL(location.href).searchParams.get('c');
      if (raw && /^[a-z0-9-]{1,32}$/i.test(raw)) {
        localStorage.setItem('colabroom_code', raw.toLowerCase());
        return raw.toLowerCase();
      }
      return localStorage.getItem('colabroom_code') || '';
    } catch (_) {
      return '';
    }
  })();

  /* Add one to a daily counter.

     `keepalive` matters on the steps that precede a navigation: without
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

     `page` rides along so the counters can be split per page. The
     function ignores it today — the step allowlist is a check constraint
     in migration 0098 and only knows the ten steps the tool records, so
     until the endpoint reads `page`, `opened` is the sum of every page
     that loads this file. Sending it now means the day the endpoint
     learns to read it, nothing here has to be republished. */
  function note(step) {
    try {
      fetch(ENDPOINT + '/note?step=' + encodeURIComponent(step)
          + (code ? '&c=' + encodeURIComponent(code) : '')
          + (page ? '&page=' + encodeURIComponent(page) : ''), {
        cache: 'no-store',
        keepalive: true,
      }).catch(function () {});
    } catch (_) {
      /* Measurement never breaks the page it measures. */
    }
  }

  note('opened');

  /* Somebody went from a page towards the app. The same selector the
     tool used, so the tool pages count exactly what they counted before
     — and now the other seven do too.

     The code rides on to the app, where an account claims it. A mailto
     cannot carry it, which is the whole reason the tool's "Get the app"
     button became a link into the app. */
  var onward = document.querySelectorAll(
    'a[href*="app.colabroom.com"], a[href^="mailto:beta@"]');
  for (var i = 0; i < onward.length; i += 1) {
    (function (link) {
      link.addEventListener('click', function () { note('clicked_app'); });
      if (code && link.href.indexOf('app.colabroom.com') !== -1) {
        try {
          var url = new URL(link.href);
          url.searchParams.set('from', code);
          link.href = url.toString();
        } catch (_) {
          /* A link that cannot be rewritten still works as it was. */
        }
      }
    }(onward[i]));
  }

  /* For chords.js, which counts the rest of the tool's own steps. */
  window.CoLab = { code: code, page: page, note: note };
}());
