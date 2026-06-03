/* ============================================================
   MISC Account page — hash-driven tab switching.
   Sidebar links use href="#orders" etc. Clicking one (or landing
   on the page with a hash) shows the matching panel and hides
   the others. Falls back to "orders" when no hash is present.
   Idempotent: safe to run multiple times.
   ============================================================ */

(function () {
  'use strict';

  var ROOT = document.querySelector('.misc-account');
  if (!ROOT) return;

  var links  = ROOT.querySelectorAll('.misc-account__nav-link[data-panel]');
  var panels = ROOT.querySelectorAll('.misc-account__panel');
  if (!links.length || !panels.length) return;

  var validPanels = {};
  panels.forEach(function (p) {
    var key = p.id.replace('misc-panel-', '');
    validPanels[key] = p;
  });

  function activate(panelKey) {
    if (!validPanels[panelKey]) panelKey = 'orders';

    panels.forEach(function (p) {
      var match = p.id === 'misc-panel-' + panelKey;
      p.hidden = !match;
      p.classList.toggle('is-active', match);
    });

    links.forEach(function (a) {
      var match = a.dataset.panel === panelKey;
      a.classList.toggle('is-active', match);
      if (a.getAttribute('role') === 'tab') {
        a.setAttribute('aria-selected', match ? 'true' : 'false');
      }
    });
  }

  // Click handler — internal tab links only (external links keep default nav).
  links.forEach(function (a) {
    if (a.classList.contains('misc-account__nav-link--external')) return;
    a.addEventListener('click', function (e) {
      var key = a.dataset.panel;
      if (!validPanels[key]) return;
      e.preventDefault();
      activate(key);
      // Push the hash so the URL is shareable + back button works.
      if (history.replaceState) {
        history.replaceState(null, '', '#' + key);
      } else {
        location.hash = key;
      }
    });
  });

  // Hash change (back/forward button)
  window.addEventListener('hashchange', function () {
    var key = (location.hash || '').replace('#', '');
    activate(key || 'orders');
  });

  // Initial state from URL hash
  var initial = (location.hash || '').replace('#', '');
  activate(initial || 'orders');

  // ---- Invoices filter chips (client-side, stub data) ----
  var chips = ROOT.querySelectorAll('.misc-panel__filters .misc-chip');
  if (chips.length) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.dataset.filter;
        chips.forEach(function (c) { c.classList.toggle('is-active', c === chip); });
        var rows = ROOT.querySelectorAll('.misc-table--invoices tbody tr');
        rows.forEach(function (row) {
          var match = filter === 'all' || row.dataset.status === filter;
          row.style.display = match ? '' : 'none';
        });
      });
    });
  }
})();
