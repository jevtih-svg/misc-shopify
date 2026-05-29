/* ============================================================
   MISC view toggle: Grid 3 / Grid 5 / List

   - Reads the active view from URL ?view= on load (Liquid has
     already set the initial DOM state; this script handles
     subsequent button clicks without a full page reload).
   - On button click: toggles the grid hidden attribute, the
     list hidden attribute, and the .is-cols-5 class on the
     grid. Updates the URL via history.replaceState so the
     view choice survives reload + is shareable.
   - Idempotent: safe to call on initial load AND after Trade's
     facets.js swaps the grid HTML (the buttons are outside
     #ProductGridContainer so they survive, but the new grid
     needs to respect the current view).

   Used by: sections/main-collection-product-grid.liquid
   ============================================================ */
(function () {
  'use strict';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function $(sel, root)  { return (root || document).querySelector(sel); }

  function currentView() {
    var container = $('#ProductGridContainer');
    if (container && container.dataset.activeView) return container.dataset.activeView;
    var params = new URLSearchParams(window.location.search);
    return params.get('view') || 'grid-3';
  }

  function applyView(view) {
    var grid = $('.product-grid');
    var list = $('.product-list');
    var container = $('#ProductGridContainer');

    if (container) container.dataset.activeView = view;

    if (grid) {
      grid.classList.toggle('is-cols-5', view === 'grid-5');
      if (view === 'list' && list) {
        grid.hidden = true;
      } else {
        grid.hidden = false;
      }
    }

    if (list) {
      list.hidden = view !== 'list';
    }

    $$('.view-toggle__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
  }

  function setView(view) {
    applyView(view);
    var url = new URL(window.location);
    if (view === 'grid-3') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', view);
    }
    window.history.replaceState({}, '', url.toString());
  }

  // Event delegation: handlers attached to document so they survive
  // any DOM swap by facets.js without needing to re-bind.
  if (!document._miscViewToggleBound) {
    document._miscViewToggleBound = true;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.view-toggle__btn');
      if (!btn) return;
      setView(btn.dataset.view);
    });

    // Sort dropdown: navigate to URL with new sort_by param.
    // (Inline onchange handlers in Liquid weren't always firing
    // after the AJAX filter swap, so we delegate from document.)
    document.addEventListener('change', function (e) {
      var sel = e.target;
      if (!sel || sel.tagName !== 'SELECT') return;

      if (sel.id === 'MiscSortBy') {
        var sortUrl = new URL(window.location);
        sortUrl.searchParams.set('sort_by', sel.value);
        sortUrl.searchParams.delete('page');
        window.location = sortUrl.toString();
        return;
      }

    });
  }

  // Pagination links (rendered by Shopify's pagination snippet)
  // don't preserve our custom query params (view, per_page). Patch
  // them on page load so clicking page 2 keeps the user's chosen
  // view and per-page count.
  function preservePaginationParams() {
    var params = new URLSearchParams(window.location.search);
    var view = params.get('view');
    var perPage = params.get('per_page');
    if (!view && !perPage) return;

    var links = document.querySelectorAll('.pagination a[href], .pagination__item[href]');
    links.forEach(function (a) {
      try {
        var u = new URL(a.href, window.location.origin);
        if (view) u.searchParams.set('view', view);
        if (perPage) u.searchParams.set('per_page', perPage);
        a.href = u.toString();
      } catch (e) { /* ignore */ }
    });
  }

  function init() {
    // Mobile (<1024px): hide the List button via CSS; if the URL is
    // ?view=list on a mobile load, coerce to grid-3.
    if (window.matchMedia('(max-width: 1023px)').matches && currentView() === 'list') {
      setView('grid-3');
    }
    applyView(currentView());
    preservePaginationParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-apply the current view after Trade's facets.js swaps the
  // grid HTML. Watch any mutation inside #ProductGridContainer.
  var container = document.querySelector('#ProductGridContainer');
  if (container && window.MutationObserver) {
    new MutationObserver(function () {
      applyView(currentView());
      preservePaginationParams();
    }).observe(container, { childList: true, subtree: true });
  }
})();
