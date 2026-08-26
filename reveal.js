// One quiet reveal on scroll, and nothing else.
//
// No parallax, no counting numbers, no carousel. Every page here is short
// enough that anything more would be decoration competing with the few things
// it has to say — and a marketing site that fights its own copy for attention
// is worse than a plain one.
//
// Elements start visible in CSS and are only hidden when motion is welcome,
// so a reader who prefers reduced motion, or whose JavaScript never runs, gets
// the whole page rather than an empty one.
(function () {
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  if (typeof IntersectionObserver !== 'function') return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '-8% 0px' });

  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
})();
