/* CRAVE ISLAND CEYLON — Supabase storefront bridge.
 * Reads only public/active catalogue rows. Checkout is intentionally not sent
 * directly to the database; order creation needs a trusted server function.
 */
(function () {
  "use strict";
  const config = window.CIC_SUPABASE_CONFIG || {};
  const placeholder = !config.anonKey || /PASTE_|YOUR_|REPLACE_ME/i.test(config.anonKey);
  const state = { client: null, connected: false, lastError: null, lastSyncAt: null };
  let statusTimer = null;

  function announce(message, type) {
    state.lastError = type === "error" ? message : null;
    window.CIC_SUPABASE_STATUS = { connected: state.connected, message, type, lastSyncAt: state.lastSyncAt };
    console.info("[CIC Supabase]", message);
    const el = document.getElementById("cicSupabaseStatus");
    if (!el) return;
    if (statusTimer) window.clearTimeout(statusTimer);
    el.textContent = message;
    el.dataset.state = type || "info";
    el.hidden = false;
    // A successful connection should not leave a permanent banner over the shop.
    if (type === "success") {
      statusTimer = window.setTimeout(() => { el.hidden = true; }, 6000);
    }
  }

  function toProduct(row) {
    return {
      id: String(row.id),
      name: row.name || "Unnamed product",
      cat: row.category || "Ceylon Native Atelier",
      price: Number(row.price || 0),
      img: row.image_url || "",
      desc: row.description || "",
      ingredients: row.ingredients || "",
      batch_number: row.batch_number || "",
      qr_code: row.qr_code || "",
      currency: row.currency || "LKR",
      source: "supabase"
    };
  }

  function showCatalogueMessage(message, canRetry) {
    const root = document.getElementById("products");
    if (!root) return;
    root.replaceChildren();
    const text = document.createElement("p");
    text.style.cssText = "font-size:13px;color:#7c6d63;padding:18px;grid-column:1/-1";
    text.textContent = message;
    root.appendChild(text);
    if (canRetry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn dark";
      button.textContent = "Retry loading products";
      button.style.cssText = "margin:0 18px 18px;grid-column:1/-1;width:max-content";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Retrying…";
        announce("Retrying the live catalogue connection…", "info");
        const ok = await syncCatalogue();
        if (!ok) {
          button.disabled = false;
          button.textContent = "Retry loading products";
        }
      });
      root.appendChild(button);
    }
  }

  async function syncCatalogue() {
    if (!state.client) return false;
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        state.client.from("products").select("id,name,description,category,price,currency,image_url,ingredients,batch_number,qr_code,is_active").eq("is_active", true).order("name"),
        state.client.from("categories").select("id,name,description,image_url,sort_order,is_active").eq("is_active", true).order("sort_order")
      ]);
      if (productsResult.error) throw productsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const rows = productsResult.data || [];
      const categoryRows = categoriesResult.data || [];

      // The database is the source of truth after a successful read, including
      // when it contains zero active rows. Never silently show demo products.
      if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) {
        PRODUCTS.splice(0, PRODUCTS.length, ...rows.map(toProduct));
      }
      if (typeof CATS !== "undefined" && Array.isArray(CATS)) {
        CATS.splice(0, CATS.length, ...categoryRows.map((row) => ({
          name: row.name,
          kicker: "CRAVE ISLAND CEYLON",
          desc: row.description || "Curated Ceylon-inspired collection.",
          img: row.image_url || ""
        })));
      }

      state.connected = true;
      state.lastSyncAt = new Date().toISOString();
      const summary = "Supabase connected · " + rows.length + " active products · " + categoryRows.length + " active categories";
      announce(summary, "success");
      if (typeof window.CIC_RENDER_CATS === "function") window.CIC_RENDER_CATS();
      if (typeof window.CIC_RENDER_PRODUCTS === "function") window.CIC_RENDER_PRODUCTS(rows.map(toProduct));
      if (!rows.length) {
        const productsEl = document.getElementById("products");
        if (productsEl) productsEl.innerHTML = '<p style="font-size:13px;color:#7c6d63;padding:18px">Our catalogue is being prepared. Please check back soon.</p>';
      }
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      return true;
    } catch (error) {
      state.connected = false;
      announce("Supabase catalogue connection failed: " + (error && error.message ? error.message : "unknown error"), "error");
      showCatalogueMessage("We could not load the live catalogue. Check your connection and try again.", true);
      return false;
    }
  }

  function activateDatabaseCatalogueMode() {
    // Once a real key is configured, do not mix device-local demo products into
    // the public catalogue, search results, category filters, or gift picker.
    if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) PRODUCTS.splice(0, PRODUCTS.length);
    if (typeof CATS !== "undefined" && Array.isArray(CATS)) CATS.splice(0, CATS.length);
    window.CIC_ALL_PRODUCTS = () => (typeof PRODUCTS !== "undefined" ? PRODUCTS : []);
    window.filterCategory = function (category) {
      const list = PRODUCTS.filter((product) => product.cat === category);
      const el = document.getElementById("products");
      if (!el) return;
      el.innerHTML = list.length && typeof window.CIC_RENDER_CARD === "function"
        ? list.map((product) => window.CIC_RENDER_CARD(product)).join("")
        : '<p style="font-size:13px;color:#7c6d63;padding:18px">No products are available in this collection yet.</p>';
      if (typeof window.jump === "function") window.jump("featured");
    };
    window.searchProducts = function (query) {
      const q = String(query || "").toLowerCase().trim();
      const list = q ? PRODUCTS.filter((product) =>
        (product.name + " " + product.cat + " " + product.desc + " " + (product.ingredients || "") + " " + (product.batch_number || "")).toLowerCase().includes(q)
      ) : PRODUCTS;
      const el = document.getElementById("products");
      if (!el) return;
      el.innerHTML = list.length && typeof window.CIC_RENDER_CARD === "function"
        ? list.map((product) => window.CIC_RENDER_CARD(product)).join("")
        : '<p style="font-size:13px;color:#7c6d63;padding:18px">No matching products are available yet.</p>';
    };
    if (typeof window.CIC_RENDER_CATS === "function") window.CIC_RENDER_CATS();
    const productsEl = document.getElementById("products");
    if (productsEl) productsEl.innerHTML = '<p style="font-size:13px;color:#7c6d63;padding:18px">Loading our Ceylon collection…</p>';
  }

  window.CIC_SUPABASE = {
    get client() { return state.client; },
    get status() { return { connected: state.connected, lastError: state.lastError, lastSyncAt: state.lastSyncAt }; },
    refreshCatalogue: syncCatalogue
  };

  if (placeholder) {
    announce("Supabase setup is incomplete: add the project's publishable key in supabase/client-config.js.", "setup");
    return;
  }
  activateDatabaseCatalogueMode();
  announce("Connecting to the CRAVE ISLAND CEYLON catalogue…", "info");
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    announce("Supabase library did not load. Check the network connection and reload.", "error");
    showCatalogueMessage("The catalogue service did not load. Check your connection and retry.", true);
    return;
  }

  state.client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  syncCatalogue();
  // Load the live owner order panel only after the authenticated Supabase client is configured.
  const ownerOrdersScript = document.createElement("script");
  ownerOrdersScript.src = "supabase-admin-orders.js";
  ownerOrdersScript.defer = true;
  document.body.appendChild(ownerOrdersScript);
  const ownerProductsScript = document.createElement("script");
  ownerProductsScript.src = "supabase-admin-products.js";
  ownerProductsScript.defer = true;
  document.body.appendChild(ownerProductsScript);
  const secureCheckoutScript = document.createElement("script");
  secureCheckoutScript.src = "supabase-checkout.js";
  secureCheckoutScript.defer = true;
  document.body.appendChild(secureCheckoutScript);

  const ownerPassportsScript = document.createElement("script");
  ownerPassportsScript.src = "supabase-admin-passports.js";
  ownerPassportsScript.defer = true;
  document.body.appendChild(ownerPassportsScript);

  // My Orders remains available through the storefront navigation/page link;
  // do not add a second fixed floating button on every screen.
})();
