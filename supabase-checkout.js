/* CRAVE ISLAND CEYLON — secure Supabase checkout
 * Loads after the existing storefront so it can safely replace the legacy WhatsApp checkout.
 * Orders are created only by the trusted create-store-order Edge Function.
 */
(function () {
  "use strict";
  const config = window.CIC_SUPABASE_CONFIG || {};
  const client = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = value => "LKR " + Number(value || 0).toLocaleString("en-LK", {minimumFractionDigits:2, maximumFractionDigits:2});
  let busy = false;

  function ensureModal() {
    if (document.getElementById("cicSecureCheckout")) return;
    const style = document.createElement("style");
    style.textContent = `
      #cicSecureCheckout{display:none;position:fixed;inset:0;z-index:10020;background:#1c110ed9;overflow:auto;padding:12px;align-items:flex-start;justify-content:center}
      #cicSecureCheckout .cic-checkout-panel{background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;border-radius:16px;width:min(720px,100%);margin:auto;padding:20px;font:14px system-ui;box-shadow:0 18px 55px #0005}
      #cicSecureCheckout h2{font:normal 26px Georgia,serif;margin:0}
      #cicSecureCheckout p{line-height:1.5}
      #cicSecureCheckout label{display:block;font-size:12px;font-weight:650;margin:10px 0 5px}
      #cicSecureCheckout input,#cicSecureCheckout textarea,#cicSecureCheckout select{box-sizing:border-box;width:100%;padding:11px;border:1px solid #d6c7b5;border-radius:8px;background:white;color:#2C1A14;font:14px system-ui}
      #cicSecureCheckout textarea{min-height:65px;resize:vertical}
      #cicSecureCheckout .cic-checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #cicSecureCheckout .cic-checkout-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}
      #cicSecureCheckout button{border:1px solid #D4AF37;border-radius:8px;padding:11px 14px;background:#2C1A14;color:#FFF8E7;font-weight:650;cursor:pointer}
      #cicSecureCheckout button.secondary{background:#f4ead3;color:#2C1A14}
      #cicSecureCheckout button:disabled{opacity:.55;cursor:wait}
      #cicSecureCheckout .cic-checkout-note{padding:11px;background:#f0e5d4;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}
      #cicSecureCheckout .cic-checkout-items{border:1px solid #e2d5c4;border-radius:10px;padding:12px;margin:12px 0}
      #cicSecureCheckout .cic-checkout-line{display:flex;justify-content:space-between;gap:12px;padding:5px 0}
      @media(max-width:560px){#cicSecureCheckout{padding:6px}#cicSecureCheckout .cic-checkout-panel{padding:14px}#cicSecureCheckout .cic-checkout-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    const modal = document.createElement("div");
    modal.id = "cicSecureCheckout";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Secure checkout");
    modal.innerHTML = `<section class="cic-checkout-panel">
      <div style="display:flex;gap:12px;justify-content:space-between;align-items:flex-start">
        <div><h2>Secure checkout</h2><p style="margin:5px 0;color:#77665b">CRAVE ISLAND CEYLON · Your order is checked against live catalogue prices.</p></div>
        <button type="button" class="secondary" id="cicCheckoutClose">Close ✕</button>
      </div>
      <div id="cicCheckoutMessage" class="cic-checkout-note" role="status" aria-live="polite">Sign in to place an order. If you are new, create an account with your email and password.</div>
      <div class="cic-checkout-items" id="cicCheckoutSummary"></div>
      <form id="cicCheckoutForm">
        <h3 style="margin:15px 0 5px">Account</h3>
        <div class="cic-checkout-grid">
          <div><label for="cicCheckoutEmail">Email address *</label><input id="cicCheckoutEmail" type="email" autocomplete="email" required maxlength="254"></div>
          <div><label for="cicCheckoutPassword">Password *</label><input id="cicCheckoutPassword" type="password" autocomplete="current-password" minlength="6" required maxlength="128"></div>
        </div>
        <div class="cic-checkout-actions"><button type="button" id="cicCheckoutSignIn" class="secondary">Sign in</button><button type="button" id="cicCheckoutSignUp" class="secondary">Create account</button></div>
        <p id="cicCheckoutAccountState" style="font-size:12px;color:#77665b;margin:7px 0">You must be signed in before placing an order.</p>
        <h3 style="margin:18px 0 5px">Delivery details</h3>
        <div class="cic-checkout-grid">
          <div><label for="cicCheckoutName">Full name *</label><input id="cicCheckoutName" autocomplete="name" maxlength="120" required></div>
          <div><label for="cicCheckoutPhone">Phone number *</label><input id="cicCheckoutPhone" type="tel" autocomplete="tel" maxlength="40" required></div>
          <div><label for="cicCheckoutCity">City / town *</label><input id="cicCheckoutCity" autocomplete="address-level2" maxlength="100" required></div>
          <div><label for="cicCheckoutDistrict">District *</label><input id="cicCheckoutDistrict" autocomplete="address-level1" maxlength="100" required></div>
        </div>
        <label for="cicCheckoutAddress">Address line 1 *</label><input id="cicCheckoutAddress" autocomplete="address-line1" maxlength="180" required>
        <div class="cic-checkout-grid">
          <div><label for="cicCheckoutAddress2">Address line 2 (optional)</label><input id="cicCheckoutAddress2" autocomplete="address-line2" maxlength="180"></div>
          <div><label for="cicCheckoutPostal">Postal code (optional)</label><input id="cicCheckoutPostal" autocomplete="postal-code" maxlength="20"></div>
        </div>
        <label for="cicCheckoutPayment">Payment method *</label><select id="cicCheckoutPayment" required><option value="cod">Cash on delivery</option><option value="bank_transfer">Bank transfer (details provided after order confirmation)</option></select>
        <label for="cicCheckoutNote">Order note (optional)</label><textarea id="cicCheckoutNote" maxlength="500" placeholder="Delivery instructions"></textarea>
        <p style="font-size:12px;color:#77665b">Delivery fee is currently set to LKR 0 until the store configures delivery rates. Please confirm delivery charges with the store before public launch.</p>
        <div class="cic-checkout-actions"><button id="cicCheckoutPlace" type="submit">Place order securely</button><button id="cicCheckoutCancel" class="secondary" type="button">Cancel</button></div>
      </form>
    </section>`;
    document.body.appendChild(modal);
    const close = () => { if (!busy) modal.style.display = "none"; };
    document.getElementById("cicCheckoutClose").addEventListener("click", close);
    document.getElementById("cicCheckoutCancel").addEventListener("click", close);
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    document.getElementById("cicCheckoutSignIn").addEventListener("click", signIn);
    document.getElementById("cicCheckoutSignUp").addEventListener("click", signUp);
    document.getElementById("cicCheckoutForm").addEventListener("submit", placeOrder);
  }

  function message(text, bad) {
    const el = document.getElementById("cicCheckoutMessage");
    if (el) { el.textContent = text; el.style.background = bad ? "#f8deda" : "#f0e5d4"; }
  }
  function getCart() {
    try {
      if (typeof cart !== "undefined" && Array.isArray(cart)) return cart;
    } catch (_) {}
    return Array.isArray(window.cart) ? window.cart : [];
  }
  function summary() {
    const el = document.getElementById("cicCheckoutSummary");
    const basket = getCart();
    let total = 0;
    if (!basket.length) { el.textContent = "Your basket is empty."; return; }
    const lines = basket.map(item => {
      const product = (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS) ? PRODUCTS : []).find(p => String(p.id) === String(item.id));
      const qty = Number(item.q || item.quantity || 0);
      const price = Number(product && (product.price ?? product.p));
      const name = product && (product.name || product.n) || "Selected product";
      const line = Number.isFinite(price) ? price * qty : 0;
      total += line;
      return '<div class="cic-checkout-line"><span>' + esc(name) + ' × ' + qty + '</span><b>' + money(line) + '</b></div>';
    }).join("");
    el.innerHTML = lines + '<div class="cic-checkout-line" style="border-top:1px solid #e2d5c4;margin-top:7px;padding-top:10px"><b>Estimated subtotal</b><b>' + money(total) + '</b></div><div style="font-size:11px;color:#77665b;margin-top:6px">Final total is recalculated by the secure server from current active product prices.</div>';
  }
  async function signedIn() {
    const db = client();
    if (!db) return null;
    const {data, error} = await db.auth.getSession();
    if (error) return null;
    return data.session && data.session.user ? data.session.user : null;
  }
  async function signIn() {
    const db = client(); if (!db) return message("Account service is not ready. Refresh the page and try again.", true);
    const email = document.getElementById("cicCheckoutEmail").value.trim();
    const password = document.getElementById("cicCheckoutPassword").value;
    if (!email || !password) return message("Enter your email and password, then tap Sign in.", true);
    const btn = document.getElementById("cicCheckoutSignIn"); btn.disabled = true;
    try {
      const {error} = await db.auth.signInWithPassword({email, password});
      if (error) throw error;
      document.getElementById("cicCheckoutAccountState").textContent = "Signed in. Complete your delivery details and place your order.";
      message("Signed in successfully. Complete delivery details to continue.");
    } catch (e) { message("Sign-in failed. Check your email and password, then try again.", true); }
    finally { btn.disabled = false; }
  }
  async function signUp() {
    const db = client(); if (!db) return message("Account service is not ready. Refresh the page and try again.", true);
    const email = document.getElementById("cicCheckoutEmail").value.trim();
    const password = document.getElementById("cicCheckoutPassword").value;
    if (!email || password.length < 6) return message("Enter a valid email and a password with at least 6 characters.", true);
    const btn = document.getElementById("cicCheckoutSignUp"); btn.disabled = true;
    try {
      const {data, error} = await db.auth.signUp({email, password});
      if (error) throw error;
      if (data.session) {
        document.getElementById("cicCheckoutAccountState").textContent = "Account created and signed in. Complete delivery details to place your order.";
        message("Account created successfully. Complete delivery details to continue.");
      } else {
        message("Account created. Check your email for the verification link, then return and sign in before placing the order.");
      }
    } catch (e) { message("Could not create the account. Check the email and try another password if necessary.", true); }
    finally { btn.disabled = false; }
  }
  async function placeOrder(event) {
    event.preventDefault();
    if (busy) return;
    const db = client(); if (!db) return message("Account service is not ready. Refresh the page and try again.", true);
    const basket = getCart();
    if (!basket.length) return message("Your basket is empty. Close checkout and add products first.", true);
    const user = await signedIn();
    if (!user) return message("Please sign in first. If you are new, create an account and verify your email if requested.", true);
    const items = basket.map(item => ({product_id:String(item.id), quantity:Number(item.q || item.quantity)}));
    if (items.some(item => !/^[0-9a-f-]{36}$/i.test(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      return message("The basket contains an item that is not in the live catalogue. Refresh the shop, then add the product again.", true);
    }
    const payload = {
      customer_name: document.getElementById("cicCheckoutName").value.trim(),
      phone: document.getElementById("cicCheckoutPhone").value.trim(),
      shipping_address: {
        line1: document.getElementById("cicCheckoutAddress").value.trim(),
        line2: document.getElementById("cicCheckoutAddress2").value.trim(),
        city: document.getElementById("cicCheckoutCity").value.trim(),
        district: document.getElementById("cicCheckoutDistrict").value.trim(),
        postal_code: document.getElementById("cicCheckoutPostal").value.trim()
      },
      payment_method: document.getElementById("cicCheckoutPayment").value,
      customer_note: document.getElementById("cicCheckoutNote").value.trim(),
      items
    };
    busy = true;
    const btn = document.getElementById("cicCheckoutPlace"); btn.disabled = true; btn.textContent = "Saving order securely…";
    message("Checking live product prices and saving your order…");
    try {
      const {data, error} = await db.functions.invoke("create-store-order", {body:payload});
      if (error || !data || data.error || !data.order) {
        const reason = data && data.error ? data.error : (error && error.message ? error.message : "Please try again.");
        throw new Error(reason);
      }
      const order = data.order;
      message("Order placed successfully. Order number: " + order.order_number + ". Total: " + money(order.total) + ". You can view its status under My Orders.", false);
      const form = document.getElementById("cicCheckoutForm");
      form.style.display = "none";
      document.getElementById("cicCheckoutSummary").innerHTML = '<b>Order confirmed: ' + esc(order.order_number) + '</b><div class="cic-checkout-line"><span>Order total</span><b>' + money(order.total) + '</b></div><p>Payment: ' + esc(order.payment_method === "cod" ? "Cash on delivery" : "Bank transfer") + ' · Status: ' + esc(order.order_status) + '</p><a href="my-orders.html" style="color:#2C1A14">View My Orders</a>';
      try { if (typeof window.clearCart === "function") window.clearCart(); else { localStorage.removeItem("crave_cart_v4"); localStorage.removeItem("crave_cart"); } } catch (_) {}
      try { if (typeof window.renderCart === "function") window.renderCart(); } catch (_) {}
    } catch (e) {
      message(e && e.message ? e.message : "Order could not be saved. Please retry.", true);
    } finally {
      busy = false; btn.disabled = false; btn.textContent = "Place order securely";
    }
  }
  function openCheckout() {
    const modal = document.getElementById("cicSecureCheckout");
    if (!modal) return;
    modal.style.display = "flex";
    document.getElementById("cicCheckoutForm").style.display = "";
    summary();
    signedIn().then(user => {
      if (user) {
        document.getElementById("cicCheckoutEmail").value = user.email || "";
        document.getElementById("cicCheckoutAccountState").textContent = "Signed in as " + (user.email || "your account") + ".";
        message("Complete your delivery details, then place your order.");
      } else {
        document.getElementById("cicCheckoutAccountState").textContent = "Please sign in or create an account before placing an order.";
      }
    });
  }
  function init() {
    if (!config.url || !config.anonKey || !window.CIC_SUPABASE || !window.CIC_SUPABASE.client) return;
    ensureModal();
    // Only declare checkout ready once the Supabase client is live.
    // Never let the old local-only or WhatsApp path pretend an order was saved.
    window.CIC_SECURE_CHECKOUT_READY = true;
    window.openCheckout = openCheckout;
    window.checkout = openCheckout;
    window.checkoutWhatsApp = openCheckout;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
