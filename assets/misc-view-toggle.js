/* ============================================================
   MISC view toggle + filter pill AJAX + pagination preservation

   Preference persistence: layered approach.

     1. localStorage holds the source of truth for the buyer's
        chosen layout (grid-3 / grid-5 / list) and per-page
        (24 / 48 / 72 / 96). Persists across page navigations,
        tabs, and browser sessions.
     2. URL params (?layout=, ?view=) reflect the preference for
        shareable links.
     3. Pagination link patcher rewrites every page-N link to
        include the current layout + view params, so clicking
        through pages preserves preferences server-side too.
     4. A document-level click delegate on pagination links is
        the final safety net: even if the patcher missed a link
        for any reason, at click time we inject the params.

   URL params:
     ?layout=grid-3|grid-5|list  — our layout toggle
     ?view=per-24|per-72|per-96  — Shopify template variant for
                                   per-page (loads collection.per-N.json)
     ?sort_by=...                — Shopify native
     ?page=N                     — Shopify native
     ?filter.* / ?q=...          — Shopify native

   localStorage keys:
     misc_layout    — 'grid-3' | 'grid-5' | 'list'
     misc_per_page  — '24' | '48' | '72' | '96'

   Used by: sections/main-collection-product-grid.liquid
   Loaded from: layout/theme.liquid
   ============================================================ */
(function () {
  'use strict';

  var LS_LAYOUT   = 'misc_layout';
  var LS_PER_PAGE = 'misc_per_page';

  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function $(sel, root)  { return (root || document).querySelector(sel); }

  /* ---------- localStorage helpers (defensive against private-mode quotas) ---------- */
  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function lsRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------- Layout (grid-3 / grid-5 / list) ---------- */

  function currentLayout() {
    // Priority: URL param > localStorage > default
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('layout');
    if (fromUrl === 'grid-3' || fromUrl === 'grid-5' || fromUrl === 'list') return fromUrl;

    var fromLS = lsGet(LS_LAYOUT);
    if (fromLS === 'grid-3' || fromLS === 'grid-5' || fromLS === 'list') return fromLS;

    var container = $('#ProductGridContainer');
    if (container && container.dataset.activeLayout) return container.dataset.activeLayout;
    return 'grid-3';
  }

  function applyLayout(layout) {
    var grid = $('.product-grid');
    var list = $('.product-list');
    var container = $('#ProductGridContainer');

    if (container) container.dataset.activeLayout = layout;

    if (grid) {
      grid.classList.toggle('is-cols-5', layout === 'grid-5');
      grid.hidden = layout === 'list';
    }
    if (list) list.hidden = layout !== 'list';

    // Keep the <html> preference class in sync. The inline head
    // script sets this on first load; we mirror it on every JS
    // toggle so the CSS rules stay accurate after the buyer
    // switches views.
    var html = document.documentElement;
    html.classList.toggle('misc-prefer-list',   layout === 'list');
    html.classList.toggle('misc-prefer-grid-5', layout === 'grid-5');

    $$('.view-toggle__btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.layout === layout);
    });
  }

  function setLayout(layout) {
    applyLayout(layout);

    // 1. Persist to localStorage (source of truth across navigations).
    if (layout === 'grid-3') {
      lsRemove(LS_LAYOUT); // grid-3 is default, no need to store
    } else {
      lsSet(LS_LAYOUT, layout);
    }

    // 2. Update current URL for shareability.
    var url = new URL(window.location);
    if (layout === 'grid-3') {
      url.searchParams.delete('layout');
    } else {
      url.searchParams.set('layout', layout);
    }
    window.history.replaceState({}, '', url.toString());

    // 3. Re-patch pagination links so the next page-N click carries
    //    the freshly chosen layout.
    preservePaginationParams();
  }

  /* ---------- Collapse the filter sidebar (desktop) ----------
     Hides the sidebar so the table / grid reclaims width. State lives
     on <html class="misc-hide-filters"> (set pre-paint in theme.liquid)
     and is persisted in localStorage. Label + chevron are CSS-driven by
     the html class; we only keep aria-expanded in sync here, including
     after facets.js swaps the filter bar HTML. */
  function applyFiltersHidden() {
    var hidden = document.documentElement.classList.contains('misc-hide-filters');
    var name = hidden ? 'Show filters' : 'Hide filters';
    $$('[data-misc-filters-toggle]').forEach(function (b) {
      b.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      // Icon-only when shown, so the accessible name + tooltip live here.
      b.setAttribute('aria-label', name);
      b.setAttribute('title', name);
    });
  }
  function setFiltersHidden(hidden) {
    document.documentElement.classList.toggle('misc-hide-filters', hidden);
    if (hidden) { lsSet('misc_filters_hidden', '1'); }
    else { lsRemove('misc_filters_hidden'); }
    applyFiltersHidden();
  }

  /* ---------- Per-page via Shopify template variant (?view=per-N) ---------- */

  function currentPerPage() {
    // Priority: URL view param > localStorage > default
    var params = new URLSearchParams(window.location.search);
    var view = params.get('view') || '';
    var match = view.match(/^per-(24|72|96)$/);
    if (match) return match[1];
    // If no view param, default template = 48 per page
    if (!view) {
      var fromLS = lsGet(LS_PER_PAGE);
      if (fromLS === '24' || fromLS === '72' || fromLS === '96') return fromLS;
      // No preference and default template → 48
      return '48';
    }
    return '48';
  }

  function setPerPage(value) {
    // Per-page maps to collection.per-N.json via Shopify's ?view= param.
    // value="48" → no view (default template).
    // value="24"|"72"|"96" → ?view=per-{value}.
    if (value === '48' || !value) {
      lsRemove(LS_PER_PAGE);
    } else {
      lsSet(LS_PER_PAGE, value);
    }

    var url = new URL(window.location);
    url.searchParams.delete('page'); // jump back to page 1 on per-page change
    if (value === '48' || !value) {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', 'per-' + value);
    }
    window.location = url.toString();
  }

  function ensurePerPagePreference() {
    // If the buyer has saved a per-page preference but landed on a
    // URL without ?view= (e.g. via direct collection link or
    // pagination that lost the param), redirect once to their
    // preferred template variant. Guarded against loops by only
    // running when URL has no ?view= AND localStorage has a non-48
    // preference AND we haven't already redirected this load.
    if (window._miscPerPageRedirected) return;
    window._miscPerPageRedirected = true;

    var params = new URLSearchParams(window.location.search);
    if (params.has('view')) return; // URL already has a template

    var pref = lsGet(LS_PER_PAGE);
    if (pref !== '24' && pref !== '72' && pref !== '96') return;

    // Redirect to the preferred template variant, preserving every
    // other URL param (page, sort_by, filters, layout, etc).
    var url = new URL(window.location);
    url.searchParams.set('view', 'per-' + pref);
    window.location.replace(url.toString());
  }

  /* ---------- Pagination link patcher ---------- */

  function paginationLinks() {
    return document.querySelectorAll(
      '.pagination a[href], .pagination__item[href], a.pagination__item'
    );
  }

  function injectParams(url) {
    // Read the canonical current state: URL first, then localStorage.
    var current = new URLSearchParams(window.location.search);
    var layout = current.get('layout') || (function () {
      var ls = lsGet(LS_LAYOUT);
      return (ls === 'grid-5' || ls === 'list') ? ls : null;
    })();
    var view = current.get('view') || (function () {
      var pref = lsGet(LS_PER_PAGE);
      return (pref === '24' || pref === '72' || pref === '96') ? 'per-' + pref : null;
    })();

    // Always normalize: set if non-null, remove otherwise.
    if (layout) url.searchParams.set('layout', layout);
    else        url.searchParams.delete('layout');
    if (view) url.searchParams.set('view', view);
    else      url.searchParams.delete('view');
    return url;
  }

  function preservePaginationParams() {
    paginationLinks().forEach(function (a) {
      try {
        var u = new URL(a.href, window.location.origin);
        a.href = injectParams(u).toString();
      } catch (e) { /* ignore */ }
    });
  }

  /* ---------- Filter pill click → AJAX remove via facets.js ---------- */

  function removePillViaAjax(href) {
    var query = href.indexOf('?') === -1 ? '' : href.slice(href.indexOf('?') + 1);
    if (window.FacetFiltersForm && typeof window.FacetFiltersForm.renderPage === 'function') {
      window.FacetFiltersForm.renderPage(query);
      return true;
    }
    return false;
  }

  /* ---------- Event delegation ---------- */

  if (!document._miscViewToggleBound) {
    document._miscViewToggleBound = true;

    document.addEventListener('click', function (e) {
      // Filter sidebar collapse toggle (desktop)
      var ft = e.target.closest('[data-misc-filters-toggle]');
      if (ft) {
        setFiltersHidden(!document.documentElement.classList.contains('misc-hide-filters'));
        return;
      }

      // Layout toggle buttons
      var btn = e.target.closest('.view-toggle__btn');
      if (btn) {
        setLayout(btn.dataset.layout);
        return;
      }

      // Filter pill removal → AJAX
      var pill = e.target.closest('.misc-applied-pill');
      if (pill && pill.href) {
        if (removePillViaAjax(pill.href)) {
          e.preventDefault();
        }
        return;
      }

      // Pagination link click — last-line safety net. Even if the
      // patcher missed this link, we inject the user's prefs at
      // click time so they survive the navigation.
      var pageLink = e.target.closest('.pagination a[href], a.pagination__item');
      if (pageLink && pageLink.href) {
        try {
          var u = new URL(pageLink.href, window.location.origin);
          var patched = injectParams(u).toString();
          if (pageLink.href !== patched) pageLink.href = patched;
        } catch (err) { /* ignore */ }
      }
    });

    // Sort + per-page dropdowns
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

      if (sel.id === 'MiscPerPage') {
        setPerPage(sel.value);
      }
    });
  }

  /* ---------- Non-catalog page guard ----------
     This script's URL params (layout / view=per-N) and its redirect
     in ensurePerPagePreference() only make sense on the catalog. On
     non-catalog pages (Contact, About, brand pages, etc.) the redirect
     would send ?view=per-N which Shopify resolves against page.per-N.json,
     falling back to the Trade default page.json — replacing our custom
     section with Trade's centred page header. Bail out and strip the
     polluting params so a back-button visit lands cleanly. */
  function isCatalogPage() {
    return !!document.querySelector('#ProductGridContainer, .product-grid, .product-list');
  }

  function stripCatalogParams() {
    var params = new URLSearchParams(window.location.search);
    var changed = false;
    if (params.has('layout')) { params.delete('layout'); changed = true; }
    if (params.has('view') && /^per-(24|48|72|96)$/.test(params.get('view'))) {
      params.delete('view'); changed = true;
    }
    if (changed) {
      var url = new URL(window.location);
      url.search = params.toString();
      window.history.replaceState({}, '', url.toString());
    }
  }

  function init() {
    if (!isCatalogPage()) {
      stripCatalogParams();
      return;
    }

    // Mobile coerce: list view doesn't fit small viewports
    if (window.matchMedia('(max-width: 1023px)').matches && currentLayout() === 'list') {
      setLayout('grid-3');
    }

    // Resolve preference: URL > localStorage > default
    var layout = currentLayout();

    // If URL has no layout but localStorage does, write it into the
    // URL silently so subsequent navigations and bookmarks carry it.
    var params = new URLSearchParams(window.location.search);
    if (!params.get('layout')) {
      var lsLayout = lsGet(LS_LAYOUT);
      if (lsLayout === 'grid-5' || lsLayout === 'list') {
        var u = new URL(window.location);
        u.searchParams.set('layout', lsLayout);
        window.history.replaceState({}, '', u.toString());
      }
    }

    applyLayout(layout);
    preservePaginationParams();
    applyFiltersHidden();

    // Keep the collapse toggle's aria-expanded correct after facets.js
    // swaps the filter bar HTML on every AJAX filter change.
    var fbar = document.querySelector('.misc-filter-bar');
    if (fbar && window.MutationObserver) {
      new MutationObserver(applyFiltersHidden).observe(fbar, { childList: true, subtree: true });
    }

    // Per-page redirect: if localStorage prefers a non-default
    // template but the URL is on the default, redirect once.
    ensurePerPagePreference();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-apply after Trade's facets.js swaps the grid HTML, and after
  // any other DOM mutation that might rewrite pagination links.
  var container = document.querySelector('#ProductGridContainer');
  if (container && window.MutationObserver) {
    new MutationObserver(function () {
      applyLayout(currentLayout());
      preservePaginationParams();
    }).observe(container, { childList: true, subtree: true });
  }
})();
