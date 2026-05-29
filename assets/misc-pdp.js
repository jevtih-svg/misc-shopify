/* ============================================================
   MISC PDP JS

   Surfaces handled:
     1. Gallery thumb click -> swap main image
     2. Variant row click -> jump main image to that variant's
        primary image (do NOT rebuild the thumb strip)
     3. Click-to-zoom lightbox
     4. Download-all-images (fetch + blob; works cross-origin)
     5. Copy-all (specs + description)

   Stepper behaviour is owned by misc-quick-add.js (loaded
   globally). This file is PDP-specific UI only.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Shared toast helper ---------- */
  function showToast(msg) {
    var toast = document.querySelector('[data-misc-toast]');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 1800);
  }

  /* ============================================================
     1. Gallery thumb click → swap main image
  ============================================================ */
  document.querySelectorAll('[data-misc-pdp-gallery]').forEach(function (gallery) {
    var mainImg = gallery.querySelector('[data-misc-pdp-main-img]');
    if (!mainImg) return;

    gallery.querySelectorAll('.misc-pdp__gallery-thumb').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        gallery.querySelectorAll('.misc-pdp__gallery-thumb').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        mainImg.src = btn.dataset.img;
      });
    });
  });

  /* ============================================================
     2. Variant row → jump to its image in the EXISTING strip
       Per Jeff: gallery always shows all images. Clicking a
       variant activates the matching thumb (if any), highlights
       the row, and updates the URL ?variant= param. The thumb
       strip is NEVER rebuilt — that destroyed parent images.
  ============================================================ */
  var variantTable = document.querySelector('[data-misc-pdp-variants]');
  if (variantTable) {
    var rows = variantTable.querySelectorAll('[data-misc-pdp-variant]');
    var gallery = document.querySelector('[data-misc-pdp-gallery]');
    var mainImg = gallery ? gallery.querySelector('[data-misc-pdp-main-img]') : null;

    // Parse the server-rendered variant→image map once.
    var variantImageMap = {};
    if (gallery) {
      var raw = gallery.dataset.variantImages || '';
      raw.split(',').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i > 0) {
          variantImageMap[pair.slice(0, i)] = pair.slice(i + 1);
        }
      });
    }

    function activateThumbByUrl(url) {
      if (!gallery || !mainImg || !url) return;
      var thumb = gallery.querySelector('.misc-pdp__gallery-thumb[data-img="' + url + '"]');
      if (thumb) {
        gallery.querySelectorAll('.misc-pdp__gallery-thumb').forEach(function (b) {
          b.classList.remove('is-active');
        });
        thumb.classList.add('is-active');
      }
      mainImg.src = url;
    }

    function activate(row) {
      rows.forEach(function (r) { r.classList.remove('is-active'); });
      row.classList.add('is-active');

      // Sync ?variant= for refresh-stability + share link correctness
      var vid = row.dataset.variantId;
      if (vid && window.history && window.history.replaceState) {
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('variant', vid);
          window.history.replaceState({}, '', url.toString());
        } catch (e) {}
      }

      // Jump to this variant's image if it has one. If not, leave
      // the gallery alone (parent images remain visible).
      var targetUrl = variantImageMap[vid];
      if (targetUrl) activateThumbByUrl(targetUrl);
    }

    rows.forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-misc-qty-stepper]')) return;
        activate(row);
      });
    });
  }

  /* ============================================================
     3. Click-to-zoom lightbox
  ============================================================ */
  var overlay = document.querySelector('[data-misc-zoom-overlay]');
  var overlayImg = overlay ? overlay.querySelector('[data-misc-zoom-img]') : null;
  var overlayClose = document.querySelector('[data-misc-zoom-close]');

  function openZoom(src, alt) {
    if (!overlay || !overlayImg) return;
    overlayImg.src = src;
    overlayImg.alt = alt || '';
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('misc-zoom-open');
  }
  function closeZoom() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('misc-zoom-open');
  }

  document.querySelectorAll('[data-misc-zoom-trigger]').forEach(function (trigger) {
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var img = trigger.querySelector('img');
      if (img) openZoom(img.src, img.alt);
    });
  });

  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeZoom();
    });
    if (overlayImg) overlayImg.addEventListener('click', closeZoom);
    if (overlayClose) overlayClose.addEventListener('click', closeZoom);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeZoom();
    });
  }

  /* ============================================================
     4. Download all images
       Reads the canonical list from data-all-images on the
       gallery (server-rendered, deduplicated). NO client-side
       collection from variant rows — that was double-counting
       images shared between parent + variants.

       Uses fetch+blob so the browser actually downloads each
       image (anchor `download` is ignored for cross-origin
       URLs; Shopify CDN is cross-origin). Sequential with
       a small stagger so the browser doesn't block bulk.
  ============================================================ */
  function getAllImageUrls() {
    var gal = document.querySelector('[data-misc-pdp-gallery]');
    if (!gal) return [];
    var raw = gal.dataset.allImages || '';
    return raw.split('||').filter(function (s) { return s.length > 0; });
  }

  function downloadOne(src) {
    return fetch(src, { mode: 'cors', credentials: 'omit' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (src.split('/').pop().split('?')[0]) || 'image.jpg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      })
      .catch(function () {
        // Fallback: open in new tab (Safari without CORS support)
        window.open(src, '_blank', 'noopener');
      });
  }

  document.querySelectorAll('[data-misc-download-images]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var srcs = getAllImageUrls();
      if (srcs.length === 0) { showToast('No images'); return; }
      showToast('Downloading ' + srcs.length + ' image' + (srcs.length === 1 ? '' : 's'));
      // Stagger so browsers don't throttle / block parallel downloads
      srcs.forEach(function (src, i) {
        setTimeout(function () { downloadOne(src); }, i * 250);
      });
    });
  });

  /* ============================================================
     5. Copy all (specs + description)
  ============================================================ */
  function copyText(text) {
    if (!text) { showToast('Nothing to copy'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('Copied');
      }).catch(function () { fallback(text); });
    } else {
      fallback(text);
    }
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied');
    } catch (e) {
      showToast('Copy failed');
    }
    document.body.removeChild(ta);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-misc-copy]');
    if (!btn) return;
    var what = btn.dataset.copy;
    var text = '';
    if (what === 'specs') {
      var specs = btn.closest('.misc-pdp__specs');
      if (!specs) return;
      var rows = specs.querySelectorAll('.misc-pdp__spec');
      text = Array.prototype.map.call(rows, function (s) {
        var label = s.querySelector('.misc-pdp__spec-label');
        var value = s.querySelector('.misc-pdp__spec-value');
        return (label ? label.textContent.trim() : '') + ': ' + (value ? value.textContent.trim().replace(/\s+/g, ' ') : '');
      }).join('\n');
    } else if (what === 'description') {
      var desc = btn.closest('.misc-pdp__desc');
      if (!desc) return;
      var body = desc.querySelector('[data-misc-copy-text]');
      text = body ? body.textContent.trim().replace(/\n{3,}/g, '\n\n') : '';
    }
    copyText(text);
  });
})();
