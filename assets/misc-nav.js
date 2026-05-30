/* ============================================================
   misc-nav.js
   Accessible click-toggle dropdowns for the MISC primary nav.
   - Click the chevron to open/close a submenu (intentional, no
     hover-to-reveal per MISC UX principle 7).
   - Only one submenu open at a time.
   - Click outside or press Escape to close.
   Idempotent: guarded so a double-load can't double-bind.
   ============================================================ */
(function () {
  'use strict';

  if (window.__miscNavInit) return;
  window.__miscNavInit = true;

  function closeAll(except) {
    var open = document.querySelectorAll('[data-misc-nav-group].is-open');
    for (var i = 0; i < open.length; i++) {
      if (open[i] === except) continue;
      open[i].classList.remove('is-open');
      var t = open[i].querySelector('[data-misc-nav-toggle]');
      if (t) t.setAttribute('aria-expanded', 'false');
    }
  }

  document.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-misc-nav-toggle]');

    if (toggle) {
      e.preventDefault();
      var group = toggle.closest('[data-misc-nav-group]');
      var isOpen = group.classList.contains('is-open');
      closeAll(group);
      if (isOpen) {
        group.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        group.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    /* A click anywhere outside an open group closes it. */
    if (!e.target.closest('[data-misc-nav-group]')) closeAll(null);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeAll(null);
  });
})();
