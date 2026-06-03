/* ============================================================
   MISC list-view row hover highlight

   The list view is a single CSS grid whose rows use `display:
   contents` (snippets/misc-product-list.liquid), so a row has no box
   of its own — CSS `.list-row:hover` is unreliable and can't tint the
   whole row. Instead we toggle a class on every cell of the hovered
   row in JS.

   Reliability is the point here: the highlight is cleared not just on
   row-to-row movement but whenever the pointer leaves the page or the
   window loses focus. A fast flick of the mouse off the top/edge of
   the screen can skip a per-row mouseout, which would otherwise leave
   a row stuck highlighted — the document/window-level handlers below
   guarantee it clears.

   Listeners live on document/window so they survive facets.js AJAX
   swaps of #ProductGridContainer. Idempotent.
   ============================================================ */
(function () {
  'use strict';

  var CLS = 'is-row-hover';
  var current = null; // the .list-row currently highlighted

  function paint(row, on) {
    if (!row) return;
    var kids = row.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList) kids[i].classList.toggle(CLS, on);
    }
  }

  function clear() {
    if (current) {
      paint(current, false);
      current = null;
    }
  }

  function setRow(row) {
    // Drop a stale reference if the previous row was swapped out by AJAX.
    if (current && !current.isConnected) current = null;
    if (row === current) return;
    clear();
    // Never highlight the column-header row.
    if (row && !row.classList.contains('list-row--head')) {
      paint(row, true);
      current = row;
    }
  }

  function onOver(e) {
    var t = e.target;
    var cell = t && t.closest ? t.closest('.list-cell') : null;
    if (cell && cell.closest('.product-list')) {
      setRow(cell.closest('.list-row'));
    } else {
      // Pointer moved to something that isn't a list cell (sidebar,
      // filter bar, header, page gap) — drop the highlight.
      clear();
    }
  }

  if (!document._miscRowHoverBound) {
    document._miscRowHoverBound = true;

    document.addEventListener('mouseover', onOver);

    // Pointer left the window (relatedTarget is null on a window exit).
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget) clear();
    });
    // Pointer left the document/viewport entirely.
    document.documentElement.addEventListener('mouseleave', clear);
    // Window lost focus (cmd/alt-tab, devtools, another app).
    window.addEventListener('blur', clear);
    // Tab hidden.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clear();
    });
  }
})();
