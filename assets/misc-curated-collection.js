/* ============================================================
   MISC Curated Collection
   - Per-product steppers (plus/minus) set that variant's quantity
     in the cart directly (catalogue logic).
   - "Add collection to cart" opens a REVIEW MODAL pre-filled with
     the curated quantities. The shopper can adjust, then Confirm
     posts everything to /cart/add.js in one request and goes to
     the cart. Copy is universal (Theme settings); see the section.
   Section: sections/misc-curated-collection.liquid
   ============================================================ */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") { fn(); }
    else { document.addEventListener("DOMContentLoaded", fn); }
  }

  // Canonical Shopify money formatter (so live totals match the store).
  function formatMoney(cents, format) {
    if (typeof cents === "string") { cents = cents.replace(".", ""); }
    var placeholder = /\{\{\s*(\w+)\s*\}\}/;
    function withDelimiters(number, precision, thousands, decimal) {
      precision = (precision === undefined) ? 2 : precision;
      thousands = (thousands === undefined) ? "," : thousands;
      decimal = (decimal === undefined) ? "." : decimal;
      if (isNaN(number) || number == null) { return 0; }
      number = (number / 100.0).toFixed(precision);
      var parts = number.split(".");
      var dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + thousands);
      var cents2 = parts[1] ? (decimal + parts[1]) : "";
      return dollars + cents2;
    }
    var value = "";
    var match = (format || "${{amount}}").match(placeholder);
    switch (match ? match[1] : "amount") {
      case "amount": value = withDelimiters(cents, 2); break;
      case "amount_no_decimals": value = withDelimiters(cents, 0); break;
      case "amount_with_comma_separator": value = withDelimiters(cents, 2, ".", ","); break;
      case "amount_no_decimals_with_comma_separator": value = withDelimiters(cents, 0, ".", ","); break;
      case "amount_with_space_separator": value = withDelimiters(cents, 2, " ", ","); break;
      case "amount_with_apostrophe_separator": value = withDelimiters(cents, 2, "'", "."); break;
      default: value = withDelimiters(cents, 2);
    }
    return (format || "${{amount}}").replace(placeholder, value);
  }

  ready(function () {
    var root = document.querySelector(".misc-curated");
    if (!root) { return; }

    function postJSON(url, body) {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (message) {
            throw new Error("Cart API " + response.status + ": " + message);
          });
        }
        return response.json();
      });
    }
    function notifyCart() {
      fetch("/cart.js").then(function (r) { return r.json(); })
        .then(function (cart) { document.dispatchEvent(new CustomEvent("misc:cart-updated", { detail: cart })); })
        .catch(function () {});
    }

    /* ---------- per-product steppers (live cart sync) ---------- */
    function setCartQty(variantId, qty) {
      return fetch("/cart.js").then(function (r) { return r.json(); })
        .then(function (cart) {
          var inCart = (cart.items || []).some(function (i) { return String(i.variant_id) === String(variantId); });
          if (inCart) { return postJSON("/cart/change.js", { id: String(variantId), quantity: qty }); }
          if (qty > 0) { return postJSON("/cart/add.js", { items: [{ id: Number(variantId), quantity: qty }] }); }
        })
        .then(function () { notifyCart(); })
        .catch(function (err) {
          console.error("MISC curated cart sync failed", err);
          return fetch("/cart.js").then(function (r) { return r.json(); }).then(function (cart) {
            var line = (cart.items || []).find(function (i) { return String(i.variant_id) === String(variantId); });
            var input = root.querySelector('.misc-curated__stepper[data-variant-id="' + variantId + '"] .misc-curated__qty');
            if (input) { input.value = line ? line.quantity : 0; }
          }).catch(function () {});
        });
    }
    var debounces = {};
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-step]");
      if (!btn) { return; }
      var stepper = btn.closest(".misc-curated__stepper");
      var input = stepper.querySelector(".misc-curated__qty");
      var v = parseInt(input.value, 10) || 0;
      v += parseInt(btn.getAttribute("data-step"), 10);
      if (v < 0) { v = 0; }
      input.value = v;
      var id = stepper.getAttribute("data-variant-id");
      clearTimeout(debounces[id]);
      debounces[id] = setTimeout(function () { setCartQty(id, v); }, 400);
    });
    root.addEventListener("change", function (e) {
      if (!e.target.classList.contains("misc-curated__qty")) { return; }
      var stepper = e.target.closest(".misc-curated__stepper");
      var v = parseInt(e.target.value, 10) || 0;
      if (v < 0) { v = 0; e.target.value = 0; }
      setCartQty(stepper.getAttribute("data-variant-id"), v);
    });

    /* ---------- review modal ---------- */
    var modal = document.getElementById("MiscCuratedModal");
    var addAll = document.getElementById("MiscCuratedAddAll");
    if (!modal || !addAll) { return; }

    var moneyFormat = modal.getAttribute("data-money-format") || "${{amount}}";
    var steppers = function () { return modal.querySelectorAll(".misc-curated-modal__stepper"); };
    var lastFocus = null;

    function recompute() {
      var units = 0, count = 0, totalCents = 0;
      steppers().forEach(function (s) {
        var price = parseInt(s.getAttribute("data-price"), 10) || 0;
        var q = parseInt(s.querySelector(".misc-curated-modal__qty").value, 10) || 0;
        units += q; if (q > 0) { count += 1; }
        totalCents += price * q;
        var sub = s.parentNode.querySelector("[data-cc-sub]");
        if (sub) { sub.textContent = formatMoney(price * q, moneyFormat); }
      });
      var t = document.getElementById("MiscCuratedModalTotals");
      if (t) {
        t.innerHTML = '<span class="misc-curated-modal__grand">' + formatMoney(totalCents, moneyFormat)
          + '</span> &middot; <b>' + count + '</b> products &middot; <b>' + units + '</b> units';
      }
    }

    function openModal() {
      // always start from the curated defaults
      steppers().forEach(function (s) {
        var input = s.querySelector(".misc-curated-modal__qty");
        input.value = s.getAttribute("data-default") || 0;
      });
      recompute();
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      lastFocus = document.activeElement;
      var c = document.getElementById("MiscCuratedModalConfirm");
      if (c) { c.focus(); }
      document.addEventListener("keydown", onKey);
    }
    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
    }
    function onKey(e) { if (e.key === "Escape") { closeModal(); } }

    addAll.addEventListener("click", openModal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest("[data-cc-close]")) { closeModal(); return; }
      var step = e.target.closest("[data-cc-mstep]");
      if (step) {
        var input = step.parentNode.querySelector(".misc-curated-modal__qty");
        var v = parseInt(input.value, 10) || 0;
        v += parseInt(step.getAttribute("data-cc-mstep"), 10);
        if (v < 0) { v = 0; }
        input.value = v;
        recompute();
      }
    });
    modal.addEventListener("input", function (e) {
      if (!e.target.classList.contains("misc-curated-modal__qty")) { return; }
      var v = parseInt(e.target.value, 10) || 0;
      if (v < 0) { v = 0; e.target.value = 0; }
      recompute();
    });

    var confirmBtn = document.getElementById("MiscCuratedModalConfirm");
    confirmBtn.addEventListener("click", function () {
      var items = [];
      steppers().forEach(function (s) {
        var q = parseInt(s.querySelector(".misc-curated-modal__qty").value, 10) || 0;
        if (q > 0) { items.push({ id: Number(s.getAttribute("data-variant-id")), quantity: q }); }
      });
      if (!items.length) { return; }
      var original = confirmBtn.textContent;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Adding…";
      postJSON("/cart/add.js", { items: items })
        .then(function () { window.location.href = "/cart"; })
        .catch(function (err) {
          console.error("MISC curated add-all failed", err);
          confirmBtn.disabled = false;
          confirmBtn.textContent = original;
        });
    });
  });
})();
