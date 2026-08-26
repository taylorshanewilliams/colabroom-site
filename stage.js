// The background is a multitrack, and scrolling the page records it.
//
// The idea rather than the implementation first, because the implementation is
// only interesting if the idea is: this site is about layering takes over each
// other, so the page performs that while you read about it. One waveform lane
// is playing when you arrive. Reach the second section and a second lane fades
// up beneath it. By the fourth you are looking at a full arrangement, and a
// playhead has been travelling down the page the whole way.
//
// Decoration, deliberately built in JavaScript and marked aria-hidden. A page
// whose *content* needs JS is broken without it; a page whose ornament does is
// simply plainer, which is a fine thing to be. Nothing here is ever the only
// place something is said.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Deterministic pseudo-random, so the waveform is the same shape on every
  // load and every page. A background that reshuffles on refresh reads as
  // noise; one that stays put reads as a recording of something.
  function seeded(seed) {
    var s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  // One lane of audio, drawn as bars. Shaped with a slow envelope over the
  // top so it swells and settles like a performance instead of sitting at a
  // constant loudness the way generated noise does.
  function lane(seed, bars, spikiness) {
    var rand = seeded(seed);
    var parts = [];
    for (var i = 0; i < bars; i += 1) {
      var t = i / bars;
      var envelope = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.6);
      var h = (0.18 + rand() * spikiness) * envelope;
      var y = (1 - h) / 2;
      parts.push(
        '<rect x="' + (i * (100 / bars)).toFixed(3) + '" y="' + (y * 100).toFixed(2) +
        '" width="' + (100 / bars * 0.55).toFixed(3) +
        '" height="' + (h * 100).toFixed(2) + '" rx="0.25"/>'
      );
    }
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' +
      parts.join('') + '</svg>';
  }

  // A few strokes each. Recognisable instruments drawn in full would compete
  // with the type; these are meant to be noticed second, on the way past.
  var instruments = {
    guitar:
      '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="46" cy="78" r="26"/><circle cx="70" cy="54" r="20"/>' +
      '<circle cx="52" cy="72" r="7"/>' +
      '<path d="M80 44 L104 18"/><rect x="100" y="8" width="14" height="14" rx="2" transform="rotate(45 107 15)"/>' +
      '</svg>',
    mic:
      '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<rect x="48" y="16" width="24" height="46" rx="12"/>' +
      '<path d="M34 54a26 26 0 0 0 52 0"/><path d="M60 80v22"/><path d="M42 104h36"/>' +
      '</svg>',
    keys:
      '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<rect x="14" y="42" width="92" height="42" rx="3"/>' +
      '<path d="M27 42v42M40 42v42M53 42v42M66 42v42M79 42v42M92 42v42"/>' +
      '<rect x="22" y="42" width="9" height="24" fill="currentColor" stroke="none" opacity="0.5"/>' +
      '<rect x="48" y="42" width="9" height="24" fill="currentColor" stroke="none" opacity="0.5"/>' +
      '<rect x="61" y="42" width="9" height="24" fill="currentColor" stroke="none" opacity="0.5"/>' +
      '<rect x="87" y="42" width="9" height="24" fill="currentColor" stroke="none" opacity="0.5"/>' +
      '</svg>',
    drum:
      '<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<ellipse cx="60" cy="44" rx="38" ry="14"/>' +
      '<path d="M22 44v28a38 14 0 0 0 76 0V44"/>' +
      '<path d="M26 52l68 20M94 52l-68 20"/>' +
      '</svg>'
  };

  var stage = document.createElement('div');
  stage.className = 'stage';
  stage.setAttribute('aria-hidden', 'true');

  var html = '';
  // Three lanes, arriving one after another. Different seeds and different
  // spikiness so they read as different instruments rather than one waveform
  // drawn three times.
  html += '<div class="lane l1">' + lane(7, 150, 0.55) + '</div>';
  html += '<div class="lane l2">' + lane(31, 150, 0.8) + '</div>';
  html += '<div class="lane l3">' + lane(97, 150, 0.35) + '</div>';

  html += '<div class="inst i1">' + instruments.guitar + '</div>';
  html += '<div class="inst i2">' + instruments.mic + '</div>';
  html += '<div class="inst i3">' + instruments.keys + '</div>';
  html += '<div class="inst i4">' + instruments.drum + '</div>';

  if (!reduce) html += '<div class="playhead"></div>';

  stage.innerHTML = html;
  document.body.insertBefore(stage, document.body.firstChild);

  // Scroll-driven CSS does the work where it exists — it runs off the main
  // thread and cannot judder. Firefox stable does not have it yet, so this
  // drives the same custom property by hand there. One number, written once
  // per frame, and every animation in the stylesheet reads from it.
  var supported = CSS && CSS.supports && CSS.supports('animation-timeline', 'scroll()');
  if (supported || reduce) return;

  var ticking = false;
  function update() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    document.documentElement.style.setProperty('--scroll', p.toFixed(4));
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();
