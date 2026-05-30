/* ============================================================
   MISC Curated Collection
   - Steppers (plus/minus only) set that variant's quantity in
     the cart directly (catalogue logic, no add button).
   - "Add collection to cart" posts every block's variant at its
     curated quantity to the cart in one request.
   Section: sections/misc-curated-collection.liquid
   ============================================================ */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") { fn(); }
    else { document.addEventListener("DOMContentLoaded", fn); }
  }

  ready(function () {
    var root = document.querySelector(".misc-curated");
    if (!root) { return; }

    function postJSON(url, body) {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body)
      });
    }

    function notifyCart() {
      fetch("/cart.js")
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          document.dispatchEvent(new CustomEvent("misc:cart-updated", { detail: cart }));
        })
        .catch(function () {});
    }

    // Set the cart line for a variant to an absolute quantity.
    function setCartQty(variantId, qty) {
      return fetch("/cart.js")
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          var inCart = (cart.items || []).some(function (i) {
            return String(i.variant_id) === String(variantId);
          });
          if (inCart) {
            return postJSON("/cart/change.js", { id: String(variantId), quantity: qty });
          }
          if (qty > 0) {
            return postJSON("/cart/add.js", { items: [{ id: Number(variantId), quantity: qty }] });
          }
        })
        .then(function () { notifyCart(); })
        .catch(function () {});
    }

    var debounces = {};
    function queueSet(variantId, qty) {
      clearTimeout(debounces[variantId]);
      debounces[variantId] = setTimeout(function () { setCartQty(variantId, qty); }, 400);
    }

    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-step]");
      if (!btn) { return; }
      var stepper = btn.closest(".misc-curated__stepper");
      var input = stepper.querySelector(".misc-curated__qty");
      var v = parseInt(input.value, 10) || 0;
      v += parseInt(btn.getAttribute("data-step"), 10);
      if (v < 0) { v = 0; }
      input.value = v;
      queueSet(stepper.getAttribute("data-variant-id"), v);
    });

    root.addEventListener("change", function (e) {
      if (!e.target.classList.contains("misc-curated__qty")) { return; }
      var stepper = e.target.closest(".misc-curated__stepper");
      var v = parseInt(e.target.value, 10) || 0;
      if (v < 0) { v = 0; e.target.value = 0; }
      setCartQty(stepper.getAttribute("data-variant-id"), v);
    });

    var addAll = document.getElementById("MiscCuratedAddAll");
    if (addAll) {
      addAll.addEventListener("click", function () {
        var items = [];
        try { items = JSON.parse(addAll.getAttribute("data-items") || "[]"); } catch (e) { items = []; }
        items = items.filter(function (it) { return it && it.id && it.quantity > 0; });
        if (!items.length) { return; }
        var label = addAll.querySelector(".misc-curated__addall-label");
        var original = label.textContent;
        label.textContent = "Adding…";
        postJSON("/cart/add.js", { items: items })
          .then(function (r) { return r.json(); })
          .then(function () {
            label.textContent = "Collection added ✓";
            notifyCart();
            setTimeout(function () { label.textContent = original; }, 1600);
          })
          .catch(function () { label.textContent = original; });
      });
    }
  });
})();
