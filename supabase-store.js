/* CRAVE ISLAND CEYLON — Supabase storefront bridge.
 * Reads only public/active catalogue rows. Checkout is intentionally not sent
 * directly to the database; order creation needs a trusted server function.
 */
(function () {
  "use strict";
  const config = window.CIC_SUPABASE_CONFIG || {};
  const placeholder = !config.anonKey || /PASTE_|YOUR_|REPLACE_ME/i.test(config.anonKey);
  const state = { client: null, connected: false, lastError: null, lastSyncAt: null };

  function announce(message, type) {
    state.lastError = type === "error" ? message : null;
    window.CIC_SUPABASE_STATUS = { connected: state.connected, message, type, lastSyncAt: state.lastSyncAt };
    console.info("[CIC Supabase]", message);
    const el = document.getElementById("cicSupabaseStatus");
    if (el) {
      el.textContent = message;
      el.dataset.state = type || "info";
      el.hidden = false;
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

      if (rows.length && typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) {
        const mapped = rows.map(toProduct);
        PRODUCTS.splice(0, PRODUCTS.length, ...mapped);
      }
      if (categoryRows.length && typeof CATS !== "undefined" && Array.isArray(CATS)) {
        const mappedCategories = categoryRows.map((row) => ({
          name: row.name,
          kicker: "CRAVE ISLAND CEYLON",
          desc: row.description || "Curated Ceylon-inspired collection.",
          img: row.image_url || ""
        }));
        CATS.splice(0, CATS.length, ...mappedCategories);
      }

      state.connected = true;
      state.lastSyncAt = new Date().toISOString();
      announce("Supabase connected · " + rows.length + " active products · " + categoryRows.length + " active categories", "success");
      if (typeof window.renderCats === "function") window.renderCats();
      if (typeof window.renderProducts === "function") window.renderProducts();
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      return true;
    } catch (error) {
      state.connected = false;
      announce("Supabase catalogue connection failed: " + (error && error.message ? error.message : "unknown error"), "error");
      return false;
    }
  }

  window.CIC_SUPABASE = {
    get client() { return state.client; },
    get status() { return { connected: state.connected, lastError: state.lastError, lastSyncAt: state.lastSyncAt }; },
    refreshCatalogue: syncCatalogue
  };

  if (placeholder) {
    announce("Supabase integration added — add the project's publishable/anon key in supabase/client-config.js to activate live catalogue sync.", "setup");
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    announce("Supabase library did not load. Check the network connection and reload.", "error");
    return;
  }

  state.client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  syncCatalogue();
})();
