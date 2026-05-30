/* ============================================================
   MISC cart ledger — interactivity
   ------------------------------------------------------------
   Wires up:
     - Filter chips (state + brand) with focus/toggle/reset.
     - Sort links (default / brand / value / qty).
     - Filtered items subtotal in the table footer.
     - Quantity stepper (+/- buttons + direct typing), debounced,
       posts to /cart/change.js, re-renders the affected section.
     - Remove link per line.
     - Ship preference radio (persists as a cart attribute via
       /cart/update.js so the Stok.ly connector reads it on
       order import).
     - PO number + order notes (cart attribute persistence on
       blur).

   This script is idempotent: it can be re-attached after a cart
   section re-render without leaving duplicate listeners or
   stuck state.
   ============================================================ */
(function () {
  'use strict';

  function init(root) {
    if (!root || root.__miscCartLedgerInit) return;
    root.__miscCartLedgerInit = true;

    var page = root;

    var stateFilter = { in: true, inbound: true, backorder: true };
    var brandFilter = {};

    var brandChips = page.querySelectorAll('[data-brand]');
    brandChips.forEach(function (chip) {
      var b = chip.getAttribute('data-brand');
      if (b) brandFilter[b] = true;
    });

    /* ---------- Filter chips: STATE ---------- */
    function allStateOn() { return stateFilter.in && stateFilter.inbound && stateFilter.backorder; }
    function countStateOn() { return (stateFilter.in ? 1 : 0) + (stateFilter.inbound ? 1 : 0) + (stateFilter.backorder ? 1 : 0); }
    function syncStateChips() {
      page.querySelectorAll('.misc-cart-ledger__chip[data-bucket]').forEach(function (chip) {
        var b = chip.getAttribute('data-bucket');
        if (stateFilter[b]) chip.classList.add('is-active');
        else chip.classList.remove('is-active');
      });
    }
    page.querySelectorAll('.misc-cart-ledger__chip[data-bucket]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var b = chip.getAttribute('data-bucket');
        if (allStateOn()) {
          stateFilter = { in: false, inbound: false, backorder: false };
          stateFilter[b] = true;
        } else if (stateFilter[b] && countStateOn() === 1) {
          stateFilter = { in: true, inbound: true, backorder: true };
        } else {
          stateFilter[b] = !stateFilter[b];
          if (!stateFilter.in && !stateFilter.inbound && !stateFilter.backorder) {
            stateFilter = { in: true, inbound: true, backorder: true };
          }
        }
        syncStateChips();
        apply();
      });
    });
    var resetState = page.querySelector('[data-action="reset-state"]');
    if (resetState) resetState.addEventListener('click', function () {
      stateFilter = { in: true, inbound: true, backorder: true };
      syncStateChips();
      apply();
    });

    /* ---------- Filter chips: BRAND ---------- */
    function allBrandOn() { for (var k in brandFilter) { if (!brandFilter[k]) return false; } return true; }
    function countBrandOn() { var c = 0; for (var k in brandFilter) { if (brandFilter[k]) c++; } return c; }
    function brandTrue() { var s = {}; brandChips.forEach(function (c) { s[c.getAttribute('data-brand')] = true; }); return s; }
    function brandFalse() { var s = {}; brandChips.forEach(function (c) { s[c.getAttribute('data-brand')] = false; }); return s; }
    function syncBrandChips() {
      brandChips.forEach(function (chip) {
        var b = chip.getAttribute('data-brand');
        if (brandFilter[b]) chip.classList.add('is-active');
        else chip.classList.remove('is-active');
      });
    }
    brandChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var b = chip.getAttribute('data-brand');
        if (allBrandOn()) {
          brandFilter = brandFalse();
          brandFilter[b] = true;
        } else if (brandFilter[b] && countBrandOn() === 1) {
          brandFilter = brandTrue();
        } else {
          brandFilter[b] = !brandFilter[b];
          if (countBrandOn() === 0) brandFilter = brandTrue();
        }
        syncBrandChips();
        apply();
      });
    });
    var resetBrand = page.querySelector('[data-action="reset-brands"]');
    if (resetBrand) resetBrand.addEventListener('click', function () {
      brandFilter = brandTrue();
      syncBrandChips();
      apply();
    });

    /* ---------- Sort (applies to BOTH views) ----------
       The table and the images view are both always in the DOM;
       only one is shown at a time. Sorting therefore has to
       reorder BOTH, otherwise sorting while the (default) Images
       view is shown looks like "nothing happens" because only the
       hidden table was reordered. */
    var itemsBody = page.querySelector('.misc-cart-ledger__items tbody');
    var imagesWrap = page.querySelector('.misc-cart-ledger__images');
    var imagesFoot = imagesWrap ? imagesWrap.querySelector('.misc-cart-ledger__images-foot') : null;

    if (itemsBody) {
      Array.prototype.forEach.call(itemsBody.querySelectorAll('.misc-cart-ledger__product-row'), function (row, idx) {
        if (!row.hasAttribute('data-original-index')) row.setAttribute('data-original-index', idx);
      });
    }
    if (imagesWrap) {
      Array.prototype.forEach.call(imagesWrap.querySelectorAll('.misc-cart-ledger__image-item'), function (item, idx) {
        if (!item.hasAttribute('data-original-index')) item.setAttribute('data-original-index', idx);
      });
    }

    function getSortMode() {
      var el = page.querySelector('.misc-cart-ledger__chip[data-sort].is-active');
      return el ? el.getAttribute('data-sort') : 'default';
    }

    /* Build a comparable entry from a product-row or image-item. */
    function entryFrom(el) {
      return {
        el: el,
        brand: el.getAttribute('data-brand') || '',
        originalIndex: parseInt(el.getAttribute('data-original-index') || '0', 10),
        totalAmount: parseInt(el.getAttribute('data-total-amount-cents') || '0', 10),
        totalQty: parseInt(el.getAttribute('data-total-qty') || '0', 10)
      };
    }

    /* One comparator shared by both views so they always agree. */
    function sortEntries(entries, mode) {
      entries.sort(function (a, b) {
        if (mode === 'brand') {
          var c = a.brand.localeCompare(b.brand, 'en', { sensitivity: 'base' });
          return c !== 0 ? c : a.originalIndex - b.originalIndex;
        }
        if (mode === 'value') {
          return b.totalAmount !== a.totalAmount ? b.totalAmount - a.totalAmount : a.originalIndex - b.originalIndex;
        }
        if (mode === 'qty') {
          return b.totalQty !== a.totalQty ? b.totalQty - a.totalQty : a.originalIndex - b.originalIndex;
        }
        return a.originalIndex - b.originalIndex;
      });
    }

    function applySortTable(mode) {
      if (!itemsBody) return;
      // Group each product row with its avail sub-rows; drop old brand rows.
      var groups = [];
      var cur = null;
      Array.prototype.forEach.call(Array.prototype.slice.call(itemsBody.children), function (row) {
        if (row.classList.contains('misc-cart-ledger__brand-row')) { row.parentNode.removeChild(row); return; }
        if (row.classList.contains('misc-cart-ledger__product-row')) {
          cur = entryFrom(row);
          cur.product = row;
          cur.avails = [];
          groups.push(cur);
        } else if (row.classList.contains('misc-cart-ledger__avail-row') && cur) {
          cur.avails.push(row);
        }
      });

      sortEntries(groups, mode);

      while (itemsBody.firstChild) itemsBody.removeChild(itemsBody.firstChild);
      var lastBrand = null;
      groups.forEach(function (group, idx) {
        if (mode === 'brand' && group.brand !== lastBrand) {
          var brandRow = document.createElement('tr');
          brandRow.className = 'misc-cart-ledger__brand-row';
          brandRow.setAttribute('data-brand', group.brand);
          var cell = document.createElement('td');
          cell.colSpan = 7;
          cell.textContent = group.brand;
          brandRow.appendChild(cell);
          itemsBody.appendChild(brandRow);
          lastBrand = group.brand;
        }
        var numCell = group.product.querySelector('.misc-cart-ledger__col-num');
        if (numCell) numCell.textContent = (idx + 1);
        itemsBody.appendChild(group.product);
        group.avails.forEach(function (a) { itemsBody.appendChild(a); });
      });
    }

    function applySortImages(mode) {
      if (!imagesWrap) return;
      // Drop old brand headers, then re-order the image items in place.
      Array.prototype.forEach.call(imagesWrap.querySelectorAll('.misc-cart-ledger__images-brand-row'), function (el) {
        el.parentNode.removeChild(el);
      });
      var entries = Array.prototype.map.call(
        imagesWrap.querySelectorAll('.misc-cart-ledger__image-item'), entryFrom);
      sortEntries(entries, mode);
      var lastBrand = null;
      entries.forEach(function (entry) {
        if (mode === 'brand' && entry.brand !== lastBrand) {
          var hdr = document.createElement('div');
          hdr.className = 'misc-cart-ledger__images-brand-row';
          hdr.setAttribute('data-brand', entry.brand);
          hdr.textContent = entry.brand;
          imagesWrap.insertBefore(hdr, imagesFoot);
          lastBrand = entry.brand;
        }
        imagesWrap.insertBefore(entry.el, imagesFoot);
      });
    }

    function applySort() {
      var mode = getSortMode();
      applySortTable(mode);
      applySortImages(mode);
    }

    page.querySelectorAll('.misc-cart-ledger__chip[data-sort]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        page.querySelectorAll('.misc-cart-ledger__chip[data-sort]').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        applySort();
        apply();
      });
    });

    /* ---------- Apply filters + recompute filtered subtotal ---------- */
    /* European number format (EUR-NL): "1.234,56".
       Liquid renders money via Shopify's currency formatter which
       uses the store's locale; this matches so JS-updated numbers
       look identical to the originally-rendered ones. The currency
       symbol comes from a data attribute set on the page root so a
       future GBP / USD store doesn't break. */
    var currencySymbol = page.getAttribute('data-currency-symbol') || '€';
    function fmt(cents) {
      var n = (cents / 100).toFixed(2);
      var parts = n.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return parts.join(',');
    }
    function money(cents) { return currencySymbol + fmt(cents); }

    function apply() {
      var anyState = !allStateOn();
      var anyBrand = !allBrandOn();

      var sumQty = 0, sumAmount = 0;

      page.querySelectorAll('.misc-cart-ledger__product-row').forEach(function (row) {
        var ready = parseInt(row.getAttribute('data-ready-qty') || '0', 10);
        var inbound = parseInt(row.getAttribute('data-inbound-qty') || '0', 10);
        var backorder = parseInt(row.getAttribute('data-backorder-qty') || '0', 10);
        var totalAmount = parseInt(row.getAttribute('data-total-amount-cents') || '0', 10);
        var totalQty = parseInt(row.getAttribute('data-total-qty') || '0', 10);
        var brand = row.getAttribute('data-brand') || '';

        var brandOk = brandFilter[brand] !== false;
        var hasReady = ready > 0 && stateFilter.in;
        var hasInbound = inbound > 0 && stateFilter.inbound;
        var hasBackorder = backorder > 0 && stateFilter.backorder;
        var stateOk = hasReady || hasInbound || hasBackorder;
        var visible = brandOk && stateOk;

        if (visible) {
          row.classList.remove('is-hidden');
          // Filtered subtotal contributions: sum the buckets that are enabled
          var lineQty = 0, lineAmount = 0;
          var unitCents = totalQty > 0 ? Math.round(totalAmount / totalQty) : 0;
          if (hasReady) { lineQty += ready; lineAmount += ready * unitCents; }
          if (hasInbound) { lineQty += inbound; lineAmount += inbound * unitCents; }
          if (hasBackorder) { lineQty += backorder; lineAmount += backorder * unitCents; }
          sumQty += lineQty;
          sumAmount += lineAmount;
        } else {
          row.classList.add('is-hidden');
        }

        // Sub-rows of this product
        var sib = row.nextElementSibling;
        while (sib && sib.classList.contains('misc-cart-ledger__avail-row')) {
          var rb = sib.getAttribute('data-bucket');
          if (!row.classList.contains('is-hidden') && stateFilter[rb]) {
            sib.classList.remove('is-hidden');
          } else {
            sib.classList.add('is-hidden');
          }
          sib = sib.nextElementSibling;
        }
      });

      // Summary shipment rows: hide non-enabled buckets, recompute shown subtotal
      var summarySubtotalCents = 0;
      page.querySelectorAll('.misc-cart-ledger__shipment').forEach(function (sh) {
        var sb = sh.getAttribute('data-bucket');
        if (stateFilter[sb]) {
          sh.classList.remove('is-hidden');
          summarySubtotalCents += parseInt(sh.getAttribute('data-amount-cents') || '0', 10);
        } else {
          sh.classList.add('is-hidden');
        }
      });
      var subAmount = page.querySelector('[data-summary-subtotal-amount]');
      var subMeta = page.querySelector('[data-summary-subtotal-meta]');
      var subLabel = page.querySelector('[data-summary-subtotal-label]');
      var filterStatus = page.querySelector('[data-filter-status]');
      if (subAmount) subAmount.textContent = fmt(summarySubtotalCents);
      if (subMeta) subMeta.textContent = sumQty + ' units · ' + countVisibleProducts() + ' products';
      if (subLabel) subLabel.textContent = (anyState || anyBrand) ? 'Filtered subtotal' : 'Summary subtotal';
      if (filterStatus) {
        var parts = [];
        if (anyState) {
          var labels = [];
          if (stateFilter.in) labels.push('Ready');
          if (stateFilter.inbound) labels.push('Incoming');
          if (stateFilter.backorder) labels.push('Backorder');
          parts.push('States: <strong>' + labels.join(' + ') + '</strong>');
        }
        if (anyBrand) {
          var brandsOn = [];
          for (var k in brandFilter) { if (brandFilter[k]) brandsOn.push(k); }
          parts.push('Brands: <strong>' + brandsOn.join(' + ') + '</strong>');
        }
        filterStatus.innerHTML = parts.join(' · ');
      }

      // Filtered items subtotal in the items table tfoot
      var filteredFoot = page.querySelector('.misc-cart-ledger__items-foot-filtered');
      var filteredQtyCell = page.querySelector('[data-filtered-qty]');
      var filteredAmountCell = page.querySelector('[data-filtered-amount]');
      if (filteredFoot && filteredQtyCell && filteredAmountCell) {
        if (anyState || anyBrand) {
          filteredFoot.hidden = false;
          filteredQtyCell.textContent = sumQty;
          filteredAmountCell.textContent = fmt(sumAmount);
        } else {
          filteredFoot.hidden = true;
        }
      }

      // Hide brand-row when all its products are filtered out
      page.querySelectorAll('.misc-cart-ledger__brand-row').forEach(function (br) {
        var sib = br.nextElementSibling;
        var any = false;
        while (sib && !sib.classList.contains('misc-cart-ledger__brand-row')) {
          if (sib.classList.contains('misc-cart-ledger__product-row') && !sib.classList.contains('is-hidden')) {
            any = true; break;
          }
          sib = sib.nextElementSibling;
        }
        if (any) br.classList.remove('is-hidden'); else br.classList.add('is-hidden');
      });

      /* Mirror the same filtering on the Images view: hide whole
         image-item when its brand or stock buckets are filtered
         out, hide individual avail rows for disabled buckets,
         recompute line totals, and toggle the filtered foot row. */
      var imgFiltSum = 0, imgFiltQty = 0;
      page.querySelectorAll('.misc-cart-ledger__image-item').forEach(function (item) {
        var ready = parseInt(item.getAttribute('data-ready-qty') || '0', 10);
        var inbound = parseInt(item.getAttribute('data-inbound-qty') || '0', 10);
        var backorder = parseInt(item.getAttribute('data-backorder-qty') || '0', 10);
        var totalAmount = parseInt(item.getAttribute('data-total-amount-cents') || '0', 10);
        var totalQty = parseInt(item.getAttribute('data-total-qty') || '0', 10);
        var brand = item.getAttribute('data-brand') || '';
        var brandOk = brandFilter[brand] !== false;
        var hasReady = ready > 0 && stateFilter.in;
        var hasInbound = inbound > 0 && stateFilter.inbound;
        var hasBackorder = backorder > 0 && stateFilter.backorder;
        var stateOk = hasReady || hasInbound || hasBackorder;
        var visible = brandOk && stateOk;
        if (visible) {
          item.classList.remove('is-hidden');
          var unitCents = totalQty > 0 ? Math.round(totalAmount / totalQty) : 0;
          var lineQty = 0, lineAmount = 0;
          if (hasReady) { lineQty += ready; lineAmount += ready * unitCents; }
          if (hasInbound) { lineQty += inbound; lineAmount += inbound * unitCents; }
          if (hasBackorder) { lineQty += backorder; lineAmount += backorder * unitCents; }
          imgFiltSum += lineAmount;
          imgFiltQty += lineQty;
          var amtEl = item.querySelector('[data-line-amount]');
          var unitsEl = item.querySelector('[data-line-units]');
          if (amtEl && unitsEl) {
            var any = anyState || anyBrand;
            amtEl.textContent = any ? money(lineAmount) : money(totalAmount);
            unitsEl.textContent = (any ? lineQty : totalQty) + ' units';
          }
        } else {
          item.classList.add('is-hidden');
        }
        // Sub-avail rows
        item.querySelectorAll('.misc-cart-ledger__image-avail').forEach(function (av) {
          var ab = av.getAttribute('data-bucket');
          if (stateFilter[ab] && !item.classList.contains('is-hidden')) av.classList.remove('is-hidden');
          else av.classList.add('is-hidden');
        });
      });
      var imgFiltFoot = page.querySelector('[data-images-filtered-foot]');
      var imgFiltQtyEl = page.querySelector('[data-images-filtered-qty]');
      var imgFiltAmtEl = page.querySelector('[data-images-filtered-amount]');
      if (imgFiltFoot && imgFiltQtyEl && imgFiltAmtEl) {
        if (anyState || anyBrand) {
          imgFiltFoot.hidden = false;
          imgFiltQtyEl.textContent = imgFiltQty + ' units';
          imgFiltAmtEl.textContent = money(imgFiltSum);
        } else {
          imgFiltFoot.hidden = true;
        }
      }

      // Hide an images brand header (sort-by-brand) when every item
      // in its group is filtered out, mirroring the table brand-row.
      page.querySelectorAll('.misc-cart-ledger__images-brand-row').forEach(function (hdr) {
        var sib = hdr.nextElementSibling;
        var anyVisible = false;
        while (sib && !sib.classList.contains('misc-cart-ledger__images-brand-row') && !sib.classList.contains('misc-cart-ledger__images-foot')) {
          if (sib.classList.contains('misc-cart-ledger__image-item') && !sib.classList.contains('is-hidden')) {
            anyVisible = true;
            break;
          }
          sib = sib.nextElementSibling;
        }
        if (anyVisible) hdr.classList.remove('is-hidden');
        else hdr.classList.add('is-hidden');
      });
    }
    function countVisibleProducts() {
      var n = 0;
      page.querySelectorAll('.misc-cart-ledger__product-row').forEach(function (row) {
        if (!row.classList.contains('is-hidden')) n++;
      });
      return n;
    }

    /* ---------- Quantity stepper + remove ---------- */
    function fetchAndReplaceSection(payload) {
      return fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(Object.assign({ sections: page.getAttribute('data-section-id') ? null : '' }, payload))
      });
    }
    function changeQty(variantId, newQty) {
      var sectionId = page.getAttribute('data-section-id');
      return fetch('/cart/change.js?sections=' + encodeURIComponent(sectionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity: newQty })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.sections && data.sections[sectionId]) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(data.sections[sectionId], 'text/html');
          var fresh = doc.querySelector('.misc-cart-ledger');
          if (fresh) {
            page.replaceWith(fresh);
            init(fresh);
          }
        } else {
          // Fallback: reload the page so cart state is consistent.
          window.location.reload();
        }
      }).catch(function () { window.location.reload(); });
    }

    page.querySelectorAll('.misc-cart-ledger__step-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var stepper = btn.closest('.misc-cart-ledger__stepper');
        if (!stepper) return;
        var input = stepper.querySelector('.misc-cart-ledger__qty-input');
        if (!input) return;
        var n = parseInt(input.value || '0', 10);
        var step = parseInt(btn.getAttribute('data-step') || '0', 10);
        var next = n + step;
        if (next < 0) next = 0;
        input.value = next;
        var vid = input.getAttribute('data-variant-id');
        if (vid) changeQty(vid, next);
      });
    });
    page.querySelectorAll('.misc-cart-ledger__qty-input').forEach(function (input) {
      var debounceTimer;
      input.addEventListener('change', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
          var n = parseInt(input.value || '0', 10);
          if (n < 0) n = 0;
          input.value = n;
          var vid = input.getAttribute('data-variant-id');
          if (vid) changeQty(vid, n);
        }, 250);
      });
    });
    page.querySelectorAll('.misc-cart-ledger__remove, .misc-cart-ledger__image-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var vid = btn.getAttribute('data-variant-id');
        if (vid) changeQty(vid, 0);
      });
    });

    /* ---------- Ship preference + cart attribute persistence ---------- */
    function updateCartAttributes(attrs) {
      return fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ attributes: attrs })
      });
    }
    page.querySelectorAll('.misc-cart-ledger__ship-pref-radio').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (radio.checked) {
          updateCartAttributes({ ship_preference: radio.value });
        }
      });
    });
    /* PO + order notes: debounced auto-save on input + on blur,
       with a small "Saved" indicator next to the label so the
       buyer trusts that the value persisted. The same inputs
       also carry name="attributes[...]" linked to the cart form
       so a form submission picks them up as a safety net. */
    function showSavedFor(el) {
      var field = el.closest('.misc-cart-ledger__field');
      if (!field) return;
      var ind = field.querySelector('[data-saved-indicator]');
      if (!ind) return;
      ind.hidden = false;
      ind.classList.remove('is-fading');
      clearTimeout(ind.__hideTimer);
      ind.__hideTimer = setTimeout(function () {
        ind.classList.add('is-fading');
        setTimeout(function () {
          ind.hidden = true;
          ind.classList.remove('is-fading');
        }, 220);
      }, 1500);
    }
    page.querySelectorAll('[data-cart-attribute]').forEach(function (el) {
      var attr = el.getAttribute('data-cart-attribute');
      var debounceTimer = null;
      var lastSaved = el.value || '';
      function save() {
        if (el.value === lastSaved) return;
        lastSaved = el.value;
        var payload = {};
        payload[attr] = el.value || '';
        updateCartAttributes(payload).then(function (r) {
          if (r && r.ok) showSavedFor(el);
        });
      }
      el.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(save, 600);
      });
      el.addEventListener('blur', function () {
        clearTimeout(debounceTimer);
        save();
      });
    });

    /* View toggle: Table | Images. Both views are always in the
       DOM; apply() updates both so a flip is instant. */
    var tableEl = page.querySelector('.misc-cart-ledger__items');
    var imagesEl = page.querySelector('.misc-cart-ledger__images');
    page.querySelectorAll('.misc-cart-ledger__chip[data-view]').forEach(function (link) {
      link.addEventListener('click', function () {
        page.querySelectorAll('.misc-cart-ledger__chip[data-view]').forEach(function (l) { l.classList.remove('is-active'); });
        link.classList.add('is-active');
        var v = link.getAttribute('data-view');
        if (v === 'images') {
          if (tableEl) tableEl.classList.add('is-hidden');
          if (imagesEl) imagesEl.classList.remove('is-hidden');
        } else {
          if (tableEl) tableEl.classList.remove('is-hidden');
          if (imagesEl) imagesEl.classList.add('is-hidden');
        }
      });
    });

    /* ---------- Dock the action bar above the footer ----------
       The bar is viewport-fixed while there's content below it.
       Once the bottom of the cart section reaches the bottom of
       the viewport, we switch the bar to absolute (parked at the
       section's bottom edge) so it stops cleanly above the site
       footer instead of overlapping it. The window listeners are
       self-cleaning: if this root has been replaced by a cart
       re-render, they detach themselves. */
    var dockRaf = null;
    function updateBarDock() {
      if (!root.isConnected) {
        window.removeEventListener('scroll', onDockScroll);
        window.removeEventListener('resize', onDockScroll);
        return;
      }
      var rect = root.getBoundingClientRect();
      var atEnd = rect.bottom <= window.innerHeight;
      root.classList.toggle('is-bar-docked', atEnd);
    }
    function onDockScroll() {
      if (dockRaf) return;
      dockRaf = window.requestAnimationFrame(function () {
        dockRaf = null;
        updateBarDock();
      });
    }
    window.addEventListener('scroll', onDockScroll, { passive: true });
    window.addEventListener('resize', onDockScroll);

    // Initial render
    syncStateChips();
    syncBrandChips();
    apply();
    updateBarDock();
  }

  function boot() {
    document.querySelectorAll('.misc-cart-ledger').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
