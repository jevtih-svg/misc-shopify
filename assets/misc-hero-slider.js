/* ============================================================
   MISC hero slider
   Section-scoped initializer. Each .misc-hero element on the page
   gets its own slider instance. Re-initialises after Shopify
   theme-editor section reloads via shopify:section:load.

   Manual navigation only (no autoplay) — B2B buyers should
   control pacing while reading editorial copy.
   ============================================================ */
(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function initSlider(hero) {
    if (!hero || hero.dataset.miscHeroInit === '1') return;
    hero.dataset.miscHeroInit = '1';

    var slides = hero.querySelectorAll('.misc-hero__slide');
    var prev = hero.querySelector('[data-misc-hero-prev]');
    var next = hero.querySelector('[data-misc-hero-next]');
    var counter = hero.querySelector('[data-misc-hero-counter]');
    var progress = hero.querySelector('[data-misc-hero-progress]');

    if (slides.length < 2) {
      // single slide: hide controls
      if (prev) prev.style.display = 'none';
      if (next) next.style.display = 'none';
      if (counter && counter.parentNode) counter.parentNode.style.display = 'none';
      return;
    }

    var i = 0;
    var total = slides.length;

    function show(idx) {
      slides.forEach(function (s, k) {
        s.classList.toggle('is-active', k === idx);
      });
      if (counter) counter.textContent = pad(idx + 1) + ' / ' + pad(total);
      if (progress) progress.style.width = ((idx + 1) / total * 100) + '%';
    }

    if (prev) prev.addEventListener('click', function () { i = (i - 1 + total) % total; show(i); });
    if (next) next.addEventListener('click', function () { i = (i + 1) % total; show(i); });
    show(0);
  }

  function initAll() {
    document.querySelectorAll('.misc-hero').forEach(initSlider);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor: re-init when a section is reloaded
  document.addEventListener('shopify:section:load', function (e) {
    var hero = e.target.querySelector ? e.target.querySelector('.misc-hero') : null;
    if (hero) {
      hero.dataset.miscHeroInit = '';
      initSlider(hero);
    }
  });
})();
