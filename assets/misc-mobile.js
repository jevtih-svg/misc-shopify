/* ============================================================
   MISC mobile chrome JS

   - Filter drawer open / close (mobile <1024px)
   - "Best on desktop" notice dismiss
   - Hamburger menu toggle (placeholder; production replaces
     with Shopify's mobile header)

   Idempotent: safe to call on initial load and after AJAX
   filter swaps from facets.js.

   Used by: sections/main-collection-product-grid.liquid
   ============================================================ */
(function () {
  'use strict';

  function $$(sel)  { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function $(sel)   { return document.querySelector(sel); }

  /* ---- Filter drawer (event delegation so handlers survive AJAX swap) ---- */
  function openDrawer() {
    var sidebar = $('.facets-vertical .facets-wrapper');
    var backdrop = $('.sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.body.classList.add('drawer-open');
  }
  function closeDrawer() {
    var sidebar = $('.facets-vertical .facets-wrapper');
    var backdrop = $('.sidebar-backdrop');
    if (!sidebar || !backdrop) return;
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('drawer-open');
  }

  function bindDrawer() {
    if (document._miscDrawerBound) return;
    document._miscDrawerBound = true;

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-mobile-filter-trigger]')) {
        openDrawer();
        return;
      }
      if (e.target.closest('[data-close-drawer]')) {
        closeDrawer();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    var mq = window.matchMedia('(min-width: 1024px)');
    function handle(e) { if (e.matches) closeDrawer(); }
    if (mq.addEventListener) mq.addEventListener('change', handle);
    else if (mq.addListener) mq.addListener(handle);
  }

  /* ---- "Best on desktop" notice dismiss (delegated) ---- */
  function bindNotice() {
    if (document._miscNoticeBound) return;
    document._miscNoticeBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mobile-notice-close]');
      if (!btn) return;
      var banner = btn.closest('[data-mobile-notice]') || $('[data-mobile-notice]');
      if (banner) banner.classList.add('is-dismissed');
    });
  }

  /* ---- Hamburger menu toggle ---- */
  function bindHamburger() {
    var trigger = $('[data-mobile-menu-trigger]');
    var header  = $('.header, header.section-header');
    if (!trigger || !header || trigger._miscBound) return;
    trigger._miscBound = true;
    trigger.addEventListener('click', function () {
      var open = header.classList.toggle('is-menu-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function init() {
    bindDrawer();
    bindNotice();
    bindHamburger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('facet:refresh', bindDrawer);
})();
