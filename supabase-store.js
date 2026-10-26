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
  let liveCategoryRows = [];

  // Fail closed: the legacy storefront's submitCheckout() stores demo orders in localStorage.
  // Route every legacy checkout submit to the trusted Supabase checkout instead.
  window.submitCheckout = function () {
    if (!window.CIC_SECURE_CHECKOUT_READY || typeof window.openCheckout !== "function") {
      if (typeof window.toast === "function") window.toast("Secure checkout is not ready. No order has been placed. Please refresh and try again.");
      return;
    }
    if (typeof window.closeModal === "function") window.closeModal("checkoutModal");
    window.openCheckout();
  };

  // Disable localStorage-only legacy admin previews in the live storefront.
  const legacyOpenModal = window.openModal;
  window.openModal = function (id) {
    if (id === "controlRoomModal") {
      // The owner-auth script adds this class only after Supabase confirms the
      // signed-in user is an approved owner. Keep the original V18 Control
      // Room as the owner's navigation hub; live data remains protected by RLS.
      if (!document.body.classList.contains("cic-owner-shortcuts-unified")) {
        const msg = "Please use Secure Admin Access and sign in with the approved owner account.";
        if (typeof window.toast === "function") window.toast(msg);
        else document.getElementById("cicSupabaseStatus")?.replaceChildren(document.createTextNode(msg));
        return;
      }
      if (typeof legacyOpenModal === "function") return legacyOpenModal.apply(this, arguments);
      return;
    }
    if (id === "adminModal") {
      const msg = "Use Secure Admin Access for live owner tools.";
      if (typeof window.toast === "function") window.toast(msg);
      else document.getElementById("cicSupabaseStatus")?.replaceChildren(document.createTextNode(msg));
      return;
    }
    if (typeof legacyOpenModal === "function") return legacyOpenModal.apply(this, arguments);
  };


  function announce(message, type) {
    state.lastError = type === "error" ? message : null;
    window.CIC_SUPABASE_STATUS = { connected: state.connected, message, type, lastSyncAt: state.lastSyncAt };
    // Keep implementation details in the developer console, not in the public storefront.
    if (type === "error" || type === "setup") console.warn("[CRAVE ISLAND CEYLON service]", message);
    const el = document.getElementById("cicSupabaseStatus");
    if (!el) return;
    if (statusTimer) window.clearTimeout(statusTimer);
    // A successful connection is an internal health signal, not customer-facing copy.
    if (type === "success" || type === "info") {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    // Do not expose provider/database names or raw service errors to customers.
    el.textContent = type === "error"
      ? "Our collection is temporarily unavailable. Please try again shortly."
      : "Our collection is being prepared. Please check back soon.";
    el.dataset.state = type || "info";
    el.hidden = false;
  }

  // Product/category image URLs are interpolated by legacy card templates.
  // Normalize them before they reach those templates to prevent attribute injection
  // and disallow javascript:, data:, and other non-web schemes.
  function safeImageUrl(value) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.origin);
      if (url.username || url.password) return "";
      if (url.protocol !== "https:" && url.origin !== window.location.origin) return "";
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function toProduct(row) {
    return {
      id: String(row.id),
      name: row.name || "Unnamed product",
      cat: row.category || "Ceylon Native Atelier",
      price: Number(row.price || 0),
      img: safeImageUrl(row.image_url),
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
        state.client.from("categories").select("id,name,description,image_url,sort_order,is_active,parent_id").eq("is_active", true).order("sort_order")
      ]);
      if (productsResult.error) throw productsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;

      const rows = productsResult.data || [];
      const categoryRows = categoriesResult.data || [];
      liveCategoryRows = categoryRows;
      const activeCategoryNames = new Set(categoryRows.map((row) => String(row.name || "")));
      // A product in a hidden/missing collection must not leak into All Products,
      // search, gift pickers, or stale category filters.
      const visibleRows = rows.filter((row) => activeCategoryNames.has(String(row.category || "")));

      // The database is the source of truth after a successful read, including
      // when it contains zero active rows. Never silently show demo products.
      if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) {
        PRODUCTS.splice(0, PRODUCTS.length, ...visibleRows.map(toProduct));
      }
      if (typeof CATS !== "undefined" && Array.isArray(CATS)) {
        CATS.splice(0, CATS.length, ...categoryRows.filter((row) => !row.parent_id).map((row) => ({
          name: row.name,
          kicker: "CRAVE ISLAND CEYLON",
          desc: row.description || "Curated Ceylon-inspired collection.",
          img: safeImageUrl(row.image_url) || "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80"
        })));
      }

      state.connected = true;
      state.lastSyncAt = new Date().toISOString();
      const summary = "Catalogue ready · " + visibleRows.length + " available products · " + categoryRows.filter((row) => !row.parent_id).length + " main categories";
      announce(summary, "success");
      // The legacy page exposes renderCats/renderProducts, not CIC_RENDER_* aliases.
      // Re-render after the async Supabase fetch so newly loaded categories actually appear.
      if (typeof window.CIC_RENDER_CATS === "function") window.CIC_RENDER_CATS();
      else if (typeof window.renderCats === "function") window.renderCats();
      if (typeof window.CIC_RENDER_PRODUCTS === "function") window.CIC_RENDER_PRODUCTS(visibleRows.map(toProduct));
      else if (typeof window.renderProducts === "function") window.renderProducts();
      if (!visibleRows.length) {
        const productsEl = document.getElementById("products");
        if (productsEl) productsEl.innerHTML = '<p style="font-size:13px;color:#7c6d63;padding:18px">Our catalogue is being prepared. Please check back soon.</p>';
      }
      if (typeof window.updateCartBadge === "function") window.updateCartBadge();
      return true;
    } catch (error) {
      state.connected = false;
      announce("Catalogue service is temporarily unavailable.", "error");
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
      const selected = liveCategoryRows.find((row) => row.name === category);
      const childNames = new Set(liveCategoryRows.filter((row) => selected && row.parent_id === selected.id).map((row) => row.name));
      const list = PRODUCTS.filter((product) => product.cat === category || childNames.has(product.cat));
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
    // Clear legacy/demo products even when configuration is missing. A setup
    // failure must never make demo catalogue entries look like real stock.
    activateDatabaseCatalogueMode();
    announce("Supabase setup is incomplete: add the project's publishable key in supabase/client-config.js.", "setup");
    showCatalogueMessage("The live catalogue is not configured yet. No demo products are available.", false);
    return;
  }
  activateDatabaseCatalogueMode();
  announce("Loading the live collection…", "info");
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    announce("Catalogue service did not load.", "error");
    showCatalogueMessage("The catalogue service did not load. Check your connection and retry.", true);
    return;
  }

  state.client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  syncCatalogue();
  // Load the live owner order panel only after the authenticated Supabase client is configured.
  const ownerOrdersScript = document.createElement("script");
  ownerOrdersScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  ownerOrdersScript.src = "supabase-admin-orders.js";
  ownerOrdersScript.defer = true;
  document.body.appendChild(ownerOrdersScript);
  const ownerProductsScript = document.createElement("script");
  ownerProductsScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  ownerProductsScript.src = "supabase-admin-products.js";
  ownerProductsScript.defer = true;
  document.body.appendChild(ownerProductsScript);
  const secureCheckoutScript = document.createElement("script");
  secureCheckoutScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  secureCheckoutScript.src = "supabase-checkout.js";
  secureCheckoutScript.defer = true;
  document.body.appendChild(secureCheckoutScript);

  const ownerPassportsScript = document.createElement("script");
  ownerPassportsScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  ownerPassportsScript.src = "supabase-admin-passports.js";
  ownerPassportsScript.defer = true;
  document.body.appendChild(ownerPassportsScript);

  const ownerAuthScript = document.createElement("script");
  ownerAuthScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  ownerAuthScript.src = "supabase-admin-auth.js";
  ownerAuthScript.defer = true;
  document.body.appendChild(ownerAuthScript);

  const ownerWorkspaceScript = document.createElement("script");
  ownerWorkspaceScript.async = false; // Preserve dependency order for dynamically loaded owner modules.
  ownerWorkspaceScript.src = "supabase-admin-workspace.js";
  ownerWorkspaceScript.defer = true;
  document.body.appendChild(ownerWorkspaceScript);


  // Owner-only red-dot alert centre. Database RLS is the final authority.
  (function installOwnerAlerts(){
    if(document.getElementById("cicOwnerAlertsButton")) return;
    const css=document.createElement("style");
    css.textContent=`
      #cicOwnerAlertsButton{position:fixed;top:14px;right:14px;z-index:10001;display:none;border:1px solid #D4AF37;border-radius:999px;background:#2C1A14;color:#FFF8E7;padding:9px 13px;font:700 12px system-ui;box-shadow:0 4px 18px #0002}
      #cicOwnerAlertsBadge{display:inline-flex;min-width:17px;height:17px;align-items:center;justify-content:center;margin-left:6px;border-radius:99px;background:#c92332;color:white;font-size:10px}
      #cicOwnerAlertsPanel{position:fixed;inset:0;z-index:10002;display:none;align-items:flex-start;justify-content:center;overflow:auto;background:#1c110ed9;padding:14px}
      #cicOwnerAlertsPanel .cic-alerts-card{box-sizing:border-box;width:min(680px,100%);margin:auto;padding:18px;border-radius:16px;background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;font:14px system-ui}
      #cicOwnerAlertsList{display:grid;gap:9px;margin-top:12px}
      .cic-alert-row{border:1px solid #e2d5c4;border-left:5px solid #c58b2b;border-radius:9px;padding:11px}
      .cic-alert-row.critical{border-left-color:#c92332}.cic-alert-row h4{margin:0 0 5px;font-size:14px}.cic-alert-row p{margin:0 0 8px;line-height:1.45;font-size:12px}.cic-alert-row button{border:1px solid #D4AF37;border-radius:7px;padding:7px 9px;background:#2C1A14;color:#FFF8E7;font-weight:600}
      @media(max-width:600px){#cicOwnerAlertsButton{top:8px;right:8px}#cicOwnerAlertsPanel{padding:7px}}
    `;
    document.head.appendChild(css);
    const button=document.createElement("button");button.id="cicOwnerAlertsButton";button.type="button";button.textContent="Owner Alerts ";
    const badge=document.createElement("span");badge.id="cicOwnerAlertsBadge";badge.textContent="0";badge.hidden=true;button.appendChild(badge);
    const panel=document.createElement("div");panel.id="cicOwnerAlertsPanel";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-label","Owner alerts");
    const card=document.createElement("section");card.className="cic-alerts-card";
    const header=document.createElement("div");header.style.cssText="display:flex;justify-content:space-between;gap:12px;align-items:center";
    const title=document.createElement("h2");title.textContent="CRAVE Control Room · Alerts";title.style.margin="0";
    const close=document.createElement("button");close.type="button";close.textContent="Close";close.style.cssText="border:1px solid #D4AF37;border-radius:8px;padding:8px 11px;background:#2C1A14;color:#FFF8E7";
    header.append(title,close);const summary=document.createElement("p");summary.id="cicOwnerAlertsSummary";summary.textContent="Checking alerts…";const reportButton=document.createElement("button");reportButton.type="button";reportButton.textContent="Send daily report to Telegram";reportButton.style.cssText="margin:8px 0;border:1px solid #D4AF37;border-radius:8px;padding:9px 12px;background:#2C1A14;color:#FFF8E7;font-weight:700";reportButton.onclick=async()=>{reportButton.disabled=true;summary.textContent="Preparing daily report…";try{const result=await window.CIC_SUPABASE.client.functions.invoke("owner-alert-notify",{body:{action:"daily_summary"}});summary.textContent=result.data?.sent?"Daily report sent to Telegram.":(result.data?.message||"Telegram is not configured yet; add the bot token and chat ID in Supabase secrets.");}catch(_){summary.textContent="Report delivery failed. Check Telegram settings.";}finally{reportButton.disabled=false;}};
    const list=document.createElement("div");list.id="cicOwnerAlertsList";card.append(header,summary,reportButton,list);panel.appendChild(card);document.body.append(button,panel);
    let lastOpenIds=new Set(), polling=false;
    function textNode(tag,value){const el=document.createElement(tag);el.textContent=value;return el;}
    async function ownerSession(){
      const db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;if(!db)return false;
      const {data:{session},error}=await db.auth.getSession();if(error||!session)return false;
      const {data,error:profileError}=await db.from("staff_profiles").select("role,approved").eq("id",session.user.id).maybeSingle();
      return !profileError&&!!data&&data.role==="owner"&&data.approved===true;
    }
    async function refresh(){
      if(polling)return;polling=true;
      try{
        const db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
        if(!db||!await ownerSession()){button.style.display="none";return;}
        button.style.display="inline-flex";
        const {data,error}=await db.from("admin_alerts").select("id,alert_type,severity,title,message,status,created_at,notification_sent_at").eq("status","open").order("created_at",{ascending:false}).limit(50);
        if(error){badge.hidden=true;summary.textContent="Alerts are temporarily unavailable. Check the owner alert permissions.";return;}
        const rows=data||[];badge.textContent=String(rows.length);badge.hidden=rows.length===0;
        rows.forEach(row=>{
          if(!lastOpenIds.has(row.id)&&!row.notification_sent_at&&Date.now()-new Date(row.created_at).getTime()<300000){
            db.functions.invoke("owner-alert-notify",{body:{alert_id:row.id}}).catch(()=>{});
          }
          lastOpenIds.add(row.id);
        });
        if(panel.style.display==="flex")render(rows);
      }catch(_){button.style.display="none";}
      finally{polling=false;}
    }
    function render(rows){
      list.replaceChildren();
      summary.textContent=rows.length?rows.length+" open alert"+(rows.length===1?"":"s")+" · newest first":"No open alerts. We'll keep checking stock, expiry and orders.";
      if(!rows.length)return;
      rows.forEach(row=>{
        const item=document.createElement("article");item.className="cic-alert-row"+(row.severity==="critical"?" critical":"");
        const h=textNode("h4",(row.severity==="critical"?"🔴 ":"🟠 ")+row.title);
        const p=textNode("p",row.message+" · "+new Date(row.created_at).toLocaleString());
        const ack=document.createElement("button");ack.type="button";ack.textContent="Acknowledge";
        ack.addEventListener("click",async()=>{
          if(!await ownerSession())return;
          const db=window.CIC_SUPABASE.client;
          const {error}=await db.from("admin_alerts").update({status:"acknowledged",acknowledged_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","open");
          if(error){summary.textContent="Could not acknowledge this alert. Please refresh.";return;}
          await refresh();const {data}=await db.from("admin_alerts").select("id,alert_type,severity,title,message,status,created_at").eq("status","open").order("created_at",{ascending:false}).limit(50);render(data||[]);
        });
        item.append(h,p,ack);list.appendChild(item);
      });
    }
    button.addEventListener("click",async()=>{panel.style.display="flex";await refresh();const db=window.CIC_SUPABASE.client;const {data}=await db.from("admin_alerts").select("id,alert_type,severity,title,message,status,created_at").eq("status","open").order("created_at",{ascending:false}).limit(50);render(data||[]);});
    close.addEventListener("click",()=>panel.style.display="none");panel.addEventListener("click",e=>{if(e.target===panel)panel.style.display="none";});
    const db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
    if(db)db.auth.onAuthStateChange(()=>window.setTimeout(refresh,200));
    refresh();window.setInterval(refresh,45000);
  })();

  // My Orders remains available through the storefront navigation/page link;
  // do not add a second fixed floating button on every screen.
})();
