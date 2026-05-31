/* ============================================================
   MISC Client Assets — behaviour (theme-blocks version)
   The Brand/Asset blocks render the cards and rows; this script
   derives the brand numbers, per-brand counts, filter chips and
   overview totals from the rendered DOM, then wires the brand
   filter and the one-click password copy.
   State is kept on the section element so the once-bound Clear and
   Copy handlers always see the latest blocks. Re-inits in the
   Theme Editor on shopify:section:load.
   ============================================================ */
(function () {
  'use strict';

  function pad2(n) { return ('0' + n).slice(-2); }

  function countsMarkup(img, cat) {
    var out = '';
    if (img > 0) { out += '<span class="misc-ca__count"><b>' + img + '</b>' + (img === 1 ? 'Image set' : 'Image sets') + '</span>'; }
    if (cat > 0) { out += '<span class="misc-ca__count"><b>' + cat + '</b>' + (cat === 1 ? 'Catalogue' : 'Catalogues') + '</span>'; }
    return out;
  }

  function initSection(root) {
    if (!root) { return; }
    var st = root.miscCa || (root.miscCa = {});

    var brands = Array.prototype.slice.call(root.querySelectorAll('.misc-ca__brand'));
    var facetsEl = root.querySelector('[data-facets]');
    var resultEl = root.querySelector('[data-result]');
    var totalEl = root.querySelector('[data-total]');
    var clearEl = root.querySelector('[data-clear]');
    var emptyEl = root.querySelector('[data-empty]');
    var statBrands = root.querySelector('[data-stat-brands]');
    var statImg = root.querySelector('[data-stat-img]');
    var statCat = root.querySelector('[data-stat-cat]');
    var statFiles = root.querySelector('[data-stat-files]');
    var mainEl = root.querySelector('.misc-ca__main');

    var totalBrands = brands.length;
    var tImg = 0, tCat = 0;

    brands.forEach(function (brand, i) {
      var assets = Array.prototype.slice.call(brand.querySelectorAll('.misc-ca__asset'));
      var img = 0, cat = 0;
      assets.forEach(function (a) {
        if (a.getAttribute('data-group') === 'catalogue') { cat += 1; } else { img += 1; }
      });
      brand.setAttribute('data-img', img);
      brand.setAttribute('data-cat', cat);
      tImg += img; tCat += cat;

      var numEl = brand.querySelector('[data-num]');
      if (numEl) { numEl.textContent = pad2(i + 1); }
      var countsEl = brand.querySelector('[data-counts]');
      if (countsEl) { countsEl.innerHTML = countsMarkup(img, cat); }
    });
    var tFiles = tImg + tCat;

    // (re)build the filter chips from scratch so handlers never stack
    if (facetsEl) {
      var allLabel = facetsEl.getAttribute('data-all-label') || 'All';
      var html = '<button type="button" class="misc-ca__facet is-active" data-brand="all" aria-pressed="true">' +
        allLabel + ' <span class="misc-ca__facet-ct">' + tFiles + '</span></button>';
      brands.forEach(function (brand) {
        var key = brand.getAttribute('data-brand') || '';
        var name = brand.getAttribute('data-name') || '';
        var n = (parseInt(brand.getAttribute('data-img'), 10) || 0) + (parseInt(brand.getAttribute('data-cat'), 10) || 0);
        html += '<button type="button" class="misc-ca__facet" data-brand="' + key + '" aria-pressed="false">' +
          name + ' <span class="misc-ca__facet-ct">' + n + '</span></button>';
      });
      facetsEl.innerHTML = html;
    }
    var facets = facetsEl ? Array.prototype.slice.call(facetsEl.querySelectorAll('.misc-ca__facet')) : [];

    if (statBrands) { statBrands.textContent = totalBrands; }
    if (statImg) { statImg.textContent = tImg; }
    if (statCat) { statCat.textContent = tCat; }
    if (statFiles) { statFiles.textContent = tFiles; }
    if (totalEl) { totalEl.textContent = totalBrands; }

    st.brands = brands;
    st.facets = facets;
    st.active = {};

    st.apply = function () {
      var act = st.active, n = 0, k;
      for (k in act) { if (act[k]) { n++; } }
      var showAll = n === 0;
      var shown = 0, img = 0, cat = 0;
      st.brands.forEach(function (b) {
        var key = b.getAttribute('data-brand');
        var on = showAll || !!act[key];
        b.classList.toggle('is-hidden', !on);
        if (on) {
          shown += 1;
          img += parseInt(b.getAttribute('data-img'), 10) || 0;
          cat += parseInt(b.getAttribute('data-cat'), 10) || 0;
        }
      });
      st.facets.forEach(function (f) {
        var key = f.getAttribute('data-brand');
        var fon = key === 'all' ? showAll : !!act[key];
        f.classList.toggle('is-active', fon);
        f.setAttribute('aria-pressed', fon ? 'true' : 'false');
      });
      if (resultEl) { resultEl.textContent = showAll ? totalBrands : shown; }
      if (clearEl) { clearEl.hidden = showAll; }
      if (emptyEl) { emptyEl.classList.toggle('is-shown', !showAll && shown === 0); }
      if (statBrands) { statBrands.textContent = shown; }
      if (statImg) { statImg.textContent = img; }
      if (statCat) { statCat.textContent = cat; }
      if (statFiles) { statFiles.textContent = img + cat; }
    };

    facets.forEach(function (f) {
      f.addEventListener('click', function () {
        var key = f.getAttribute('data-brand');
        if (key === 'all') { st.active = {}; } else { st.active[key] = !st.active[key]; }
        st.apply();
        if (mainEl) {
          var y = mainEl.getBoundingClientRect().top + window.pageYOffset - 72;
          if (window.pageYOffset > y) { window.scrollTo({ top: y, behavior: 'smooth' }); }
        }
      });
    });

    if (!st.bound) {
      st.bound = true;
      if (clearEl) {
        clearEl.addEventListener('click', function () { st.active = {}; st.apply(); });
      }
      var copyBtn = root.querySelector('.misc-ca__passfield');
      if (copyBtn) {
        var labelEl = copyBtn.querySelector('[data-copy-label]');
        var defaultLabel = labelEl ? labelEl.textContent : '';
        copyBtn.addEventListener('click', function () {
          var pass = copyBtn.getAttribute('data-pass') || '';
          function done() {
            copyBtn.classList.add('is-copied');
            if (labelEl) { labelEl.textContent = copyBtn.getAttribute('data-copied-label') || 'Copied'; }
            window.setTimeout(function () {
              copyBtn.classList.remove('is-copied');
              if (labelEl) { labelEl.textContent = defaultLabel; }
            }, 1600);
          }
          function fallback() {
            var t = document.createElement('textarea');
            t.value = pass; t.style.position = 'fixed'; t.style.opacity = '0';
            document.body.appendChild(t); t.focus(); t.select();
            try { document.execCommand('copy'); } catch (e) { /* no-op */ }
            document.body.removeChild(t); done();
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(pass).then(done).catch(fallback);
          } else { fallback(); }
        });
      }
    }

    st.apply();
  }

  function initAll() {
    document.querySelectorAll('.misc-ca').forEach(initSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', function (e) {
    var root = null;
    if (e.target && e.target.classList && e.target.classList.contains('misc-ca')) { root = e.target; }
    else if (e.target && e.target.querySelector) { root = e.target.querySelector('.misc-ca'); }
    if (root) { initSection(root); }
  });
})();
