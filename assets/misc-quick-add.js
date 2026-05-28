/* ============================================================
   MISC quick-add stepper (debounced bulk cart sync)

   Behaviour: on the catalog card, the stepper IS the add-to-cart.
     - Default value: current quantity of this variant in the cart
       (0 if not yet in the cart).
     - Click +/- : the displayed value changes IMMEDIATELY. No
       network call yet. The buyer can click +, +, +, +, +, - as
       fast as they want.
     - After DEBOUNCE_MS of no further clicks, a single cart
       request reconciles the displayed value against the cart:
         - desired > cart_qty : POST /cart/add.js for the delta
         - desired < cart_qty : POST /cart/change.js with absolute
                                quantity (0 removes the line)
         - desired == cart_qty: no-op
     - After the request lands, refresh cart drawer + bubble.
     - If the buyer keeps clicking while a request is in flight,
       the next sync is queued and fires once the current one ends.

   Failure mode: if the cart API rejects the request, the displayed
   value snaps back to whatever the cart actually holds, so the UI
   never lies to the buyer.

   Used by: snippets/misc-card-product.liquid
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     SIDEBAR ACCORDION FORCE-OPEN
     Our misc-facets.liquid template already renders every
     <details class="misc-filter-group" open> with the open
     attribute, so this is just defence in depth for cases
     where Trade's AJAX refresh ships HTML without the attr.
     ============================================================ */
  function forceOpenSidebarDetails() {
    document
      .querySelectorAll('.misc-filter-group, .facets-vertical .facets-wrapper details')
      .forEach(function (el) {
        if (el.tagName === 'DETAILS' && !el.hasAttribute('open')) {
          el.setAttribute('open', '');
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceOpenSidebarDetails);
  } else {
    forceOpenSidebarDetails();
  }
  document.addEventListener('facet:refresh', forceOpenSidebarDetails);
  document.documentElement.addEventListener('cart:refresh', forceOpenSidebarDetails);

  var moTarget = document.querySelector('#main-collection-filters');
  if (moTarget && window.MutationObserver) {
    new MutationObserver(forceOpenSidebarDetails).observe(moTarget, {
      childList: true,
      subtree: true,
    });
  }

  /* ============================================================
     THOUSANDS SEPARATOR
     Liquid has no built-in thousands-separator filter. We insert
     commas via JS on:
       - product count in the sort row ("1404 products" → "1,404")
       - filter option counts ("In stock 1171" → "1,171")
     The regex (\d)(?=(\d{3})+(?!\d)) matches a digit followed by
     groups of three digits and inserts a comma after each match,
     which gives standard EN thousands separators.
     ============================================================ */
  function commaSeparate(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatNumbersInDom(root) {
    var scope = root || document;
    // Product count in the sort row
    scope
      .querySelectorAll('.product-count__text, #ProductCountDesktop')
      .forEach(function (el) {
        el.innerHTML = el.innerHTML.replace(/\b(\d{4,})\b/g, function (m) {
          return commaSeparate(m);
        });
      });
    // Filter option counts in our sidebar
    scope
      .querySelectorAll('.misc-filter-option__count')
      .forEach(function (el) {
        var n = parseInt(el.textContent, 10);
        if (!isNaN(n) && n >= 1000) el.textContent = commaSeparate(n);
      });
    // Replace hyphen with en-dash in sort options ("A-Z" → "A–Z")
    scope
      .querySelectorAll('.facet-filters__sort option, .facets__label-sort-by + .select select option')
      .forEach(function (el) {
        if (el.text && el.text.indexOf(' - ') === -1) {
          el.text = el.text.replace(/, A-Z\b/, ', A–Z').replace(/, Z-A\b/, ', Z–A');
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { formatNumbersInDom(); });
  } else {
    formatNumbersInDom();
  }
  document.addEventListener('facet:refresh', function () { formatNumbersInDom(); });
  document.documentElement.addEventListener('cart:refresh', function () { formatNumbersInDom(); });

  // Re-apply after Trade's AJAX section refresh swaps the count node.
  var countTarget = document.querySelector('#ProductCountDesktop');
  if (countTarget && window.MutationObserver) {
    new MutationObserver(function () { formatNumbersInDom(); }).observe(countTarget, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /* ============================================================
     "SHOW MORE" inside filter groups
     Toggles the visibility of options past the show_more
     threshold defined in misc-facets.liquid. Replaces Trade's
     show-more.js which we don't load.
     ============================================================ */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-misc-show-more]');
    if (!btn) return;
    e.preventDefault();

    var group = btn.closest('.misc-filter-group');
    if (!group) return;

    var hidden = group.querySelectorAll('.misc-filter-option--hidden');
    var isExpanded = btn.getAttribute('aria-expanded') === 'true';

    hidden.forEach(function (item) {
      item.classList.toggle('is-revealed', !isExpanded);
    });

    btn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    btn.textContent = isExpanded
      ? 'Show ' + hidden.length + ' more'
      : 'Show fewer';
  });

  var DEBOUNCE_MS = 600; // delay after the last click before syncing

  function $(sel, root) { return (root || document).querySelector(sel); }

  // Per-stepper state, keyed by the stepper DOM node.
  var stepperState = new WeakMap();

  function getState(stepper) {
    var s = stepperState.get(stepper);
    if (!s) {
      var input = stepper.querySelector('[data-misc-qty-input]');
      var initial = Math.max(0, parseInt(input && input.value, 10) || 0);
      s = {
        cartQty: initial,    // what we believe is in the cart
        desiredQty: initial, // what the buyer has clicked to
        timer: null,         // debounce handle
        inFlight: false,     // a /cart/* request is currently running
        pending: false       // another sync is queued after this one
      };
      stepperState.set(stepper, s);
    }
    return s;
  }

  async function refreshCartUI() {
    try {
      var resp = await fetch('/?sections=cart-drawer,cart-icon-bubble,cart-notification-button');
      if (!resp.ok) return;
      var sections = await resp.json();
      var parser = new DOMParser();

      if (sections['cart-drawer']) {
        var doc = parser.parseFromString(sections['cart-drawer'], 'text/html');
        var newEl = doc.querySelector('cart-drawer');
        var curEl = $('cart-drawer');
        if (newEl && curEl) curEl.innerHTML = newEl.innerHTML;
      }

      if (sections['cart-icon-bubble']) {
        var bubbleDoc = parser.parseFromString(sections['cart-icon-bubble'], 'text/html');
        var newBubble = bubbleDoc.querySelector('#cart-icon-bubble');
        var curBubble = $('#cart-icon-bubble');
        if (newBubble && curBubble) curBubble.innerHTML = newBubble.innerHTML;
      }

      document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
    } catch (err) {
      console.error('MISC: cart UI refresh failed', err);
    }
  }

  async function postCart(url, body) {
    var resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      var msg = await resp.text();
      throw new Error('Cart API ' + resp.status + ': ' + msg);
    }
    return resp.json();
  }

  async function syncStepper(stepper) {
    var state = getState(stepper);

    if (state.inFlight) {
      // Don't start a second request; remember to sync again after.
      state.pending = true;
      return;
    }

    var variantId = parseInt(stepper.getAttribute('data-variant-id'), 10);
    if (!variantId) return;

    var desired = state.desiredQty;
    var current = state.cartQty;

    if (desired === current) {
      stepper.classList.remove('is-dirty');
      return;
    }

    state.inFlight = true;
    stepper.classList.add('is-syncing');

    try {
      if (desired > current) {
        // Add the delta. /cart/add.js works whether or not the
        // variant is already in the cart.
        await postCart('/cart/add.js', {
          id: variantId,
          quantity: desired - current
        });
      } else {
        // Shrink (or remove) the line to an absolute quantity.
        await postCart('/cart/change.js', {
          id: variantId,
          quantity: desired
        });
      }

      state.cartQty = desired;
      await refreshCartUI();
    } catch (err) {
      console.error('MISC quick-add sync failed', err);
      // Snap the visible value back to whatever the cart truly holds.
      state.desiredQty = state.cartQty;
      var input = stepper.querySelector('[data-misc-qty-input]');
      if (input) input.value = state.cartQty;
    } finally {
      state.inFlight = false;
      stepper.classList.remove('is-syncing');

      if (state.pending) {
        // More clicks happened while syncing. Run another debounce
        // window so we still bundle anything that's still arriving.
        state.pending = false;
        scheduleSync(stepper);
      } else if (state.desiredQty === state.cartQty) {
        stepper.classList.remove('is-dirty');
      }
    }
  }

  function scheduleSync(stepper) {
    var state = getState(stepper);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.timer = null;
      syncStepper(stepper);
    }, DEBOUNCE_MS);
  }

  // +/- buttons: optimistic update, then debounce a sync.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-misc-qty]');
    if (!btn) return;
    e.preventDefault();

    var stepper = btn.closest('[data-misc-qty-stepper]');
    if (!stepper) return;

    var input = stepper.querySelector('[data-misc-qty-input]');
    if (!input) return;

    var delta = parseInt(btn.getAttribute('data-misc-qty'), 10) || 0;
    var state = getState(stepper);
    var next = Math.max(0, state.desiredQty + delta);

    if (next === state.desiredQty) return; // e.g. minus on 0

    state.desiredQty = next;
    input.value = next;
    stepper.classList.add('is-dirty');

    scheduleSync(stepper);
  });

  // Typed input (in case the readonly attribute is ever removed):
  // treat a direct edit the same way as a +/- click.
  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-misc-qty-input]');
    if (!input) return;
    var stepper = input.closest('[data-misc-qty-stepper]');
    if (!stepper) return;

    var typed = Math.max(0, parseInt(input.value, 10) || 0);
    var state = getState(stepper);
    if (typed === state.desiredQty) return; // event we triggered ourselves

    state.desiredQty = typed;
    input.value = typed;
    stepper.classList.add('is-dirty');
    scheduleSync(stepper);
  });
})();
