/* CRAVE ISLAND CEYLON — real Supabase owner authentication.
 * Never grants access based on browser-only role selection or a pretend OTP.
 * The database RLS policies remain the source of authorization.
 */
(function () {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const text = (message, bad=false) => {
    const el = $("#cicOwnerAuthStatus");
    if (!el) return;
    el.textContent = message;
    el.style.cssText = "margin-top:10px;padding:10px 12px;border-radius:9px;background:"+(bad?"#f8deda":"#f0e5d4")+";color:#2C1A14;font-size:12px;line-height:1.5";
    el.hidden = false;
  };
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;

  function install() {
    const modal = $("#adminAccessModal");
    const email = $("#adminEmail");
    const password = $("#adminOtp");
    const actions = modal && $(".login-actions", modal);
    if (!modal || !email || !password || !actions || modal.dataset.cicRealAuth === "true") return;
    modal.dataset.cicRealAuth = "true";

    email.placeholder = "Owner account email";
    email.autocomplete = "username";
    password.type = "password";
    password.name = "password";
    password.maxLength = 128;
    password.minLength = 8;
    password.inputMode = "text";
    password.autocomplete = "current-password";
    password.placeholder = "Your account password";
    const passLabel = $('label[for="adminOtp"]', modal);
    if (passLabel) passLabel.textContent = "Password";
    const buttons = actions.querySelectorAll("button");
    if (buttons[0]) {
      buttons[0].textContent = "Sign in securely";
      buttons[0].type = "button";
      buttons[0].onclick = signIn;
    }
    if (buttons[1]) {
      buttons[1].textContent = "Forgot password?";
      buttons[1].type = "button";
      buttons[1].onclick = resetPassword;
    }

    let status = $("#cicOwnerAuthStatus", modal);
    if (!status) {
      status = document.createElement("div");
      status.id = "cicOwnerAuthStatus";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.hidden = true;
      actions.insertAdjacentElement("afterend", status);
    }
    let signOut = $("#cicOwnerSignOut", modal);
    if (!signOut) {
      signOut = document.createElement("button");
      signOut.id = "cicOwnerSignOut";
      signOut.type = "button";
      signOut.className = "secondary-btn";
      signOut.textContent = "Sign out";
      signOut.style.cssText = "margin-top:9px;width:100%;display:none";
      signOut.onclick = async () => {
        const client = db();
        if (!client) return text("The Supabase connection is not ready. Reload the page and try again.", true);
        const { error } = await client.auth.signOut();
        if (error) return text("Could not sign out. Please try again.", true);
        signOut.style.display = "none";
        text("You have signed out.");
      };
      status.insertAdjacentElement("afterend", signOut);
    }

    const intro = $(".muted-note", modal);
    if (intro) intro.textContent = "Sign in with the existing CRAVE ISLAND CEYLON owner account. Access is granted only if Supabase confirms that the signed-in account is an approved owner.";
    const note = $(".access-note", modal);
    if (note) note.textContent = "Real authentication: your password is checked by Supabase Auth. Owner access is then checked against the approved staff profile and database RLS. No demo OTP is accepted.";
    modal.addEventListener("keydown", event => {
      if (event.key === "Enter" && (event.target === email || event.target === password)) {
        event.preventDefault();
        signIn();
      }
    });
    checkExistingSession();
  }

  async function approvedOwner(user) {
    const client = db();
    if (!client || !user) return false;
    const { data, error } = await client.from("staff_profiles")
      .select("role,approved").eq("id", user.id).maybeSingle();
    return !error && !!data && data.role === "owner" && data.approved === true;
  }

  async function signIn() {
    const client = db();
    const email = ($("#adminEmail")?.value || "").trim();
    const password = $("#adminOtp")?.value || "";
    if (!client) return text("Supabase is still connecting. Please wait a moment and try again.", true);
    if (!email || !email.includes("@")) return text("Enter the email address for your existing owner account.", true);
    if (!password) return text("Enter your account password.", true);

    const button = $(".login-actions button");
    if (button) { button.disabled = true; button.textContent = "Checking account…"; }
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        text("Sign-in failed. Check the email/password, or use Forgot password. No access has been granted.", true);
        return;
      }
      if (!data.user || !(await approvedOwner(data.user))) {
        await client.auth.signOut();
        text("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.", true);
        return;
      }
      const signOut = $("#cicOwnerSignOut");
      if (signOut) signOut.style.display = "block";
      text("Owner account verified. Opening the live catalogue manager…");
      const modal = $("#adminAccessModal");
      if (typeof window.closeModal === "function" && modal) window.closeModal("adminAccessModal");
      else if (modal) modal.style.display = "none";
      openLiveCatalogue();
    } catch (error) {
      text("Could not complete sign-in because of a connection error. Please try again.", true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Sign in securely"; }
    }
  }

  async function resetPassword() {
    const client = db();
    const email = ($("#adminEmail")?.value || "").trim();
    if (!client) return text("Supabase is still connecting. Please wait and try again.", true);
    if (!email || !email.includes("@")) return text("Enter your owner account email first, then choose Forgot password.", true);
    const button = $(".login-actions button:nth-child(2)");
    if (button) { button.disabled = true; button.textContent = "Sending…"; }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error) text("Password reset email could not be sent. Check Supabase Auth email settings and try again.", true);
      else text("If this email belongs to an account, Supabase will send password-reset instructions. Check your inbox and spam folder.");
    } catch (error) {
      text("Could not request a password reset because of a connection error.", true);
    } finally {
      if (button) { button.disabled = false; button.textContent = "Forgot password?"; }
    }
  }

  async function checkExistingSession() {
    const client = db();
    if (!client) return;
    try {
      const { data } = await client.auth.getSession();
      if (data && data.session && data.session.user && await approvedOwner(data.session.user)) {
        const signOut = $("#cicOwnerSignOut");
        if (signOut) signOut.style.display = "block";
        text("An approved owner session is already active. You can open the live catalogue manager.");
      }
    } catch (_) {}
  }

  function openLiveCatalogue() {
    let tries = 0;
    const attempt = () => {
      const button = $("#cicOwnerCatalogueButton");
      if (button) {
        button.hidden = false;
        button.click();
        return;
      }
      tries += 1;
      if (tries < 30) window.setTimeout(attempt, 200);
      else text("You are signed in, but the catalogue manager did not finish loading. Reload the page once, then tap Admin and sign in again.", true);
    };
    window.setTimeout(attempt, 150);
  }

  function wire() {
    install();
    const original = window.openAdminAccess;
    window.openAdminAccess = function () {
      if (typeof original === "function") original.apply(this, arguments);
      const modal = $("#adminAccessModal");
      if (modal) {
        const status = $("#cicOwnerAuthStatus", modal);
        if (status) status.hidden = true;
        const email = $("#adminEmail");
        if (email) email.focus({ preventScroll: true });
      }
      checkExistingSession();
    };
    // Explicitly disable the old browser-only demo OTP route.
    window.requestAdminOtp = function () {
      text("Use the email and password fields above. Demo OTP login is disabled.", true);
    };
    window.verifyAdminOtpDemo = function () {
      text("Demo OTP login is disabled. Only a real Supabase owner sign-in is accepted.", true);
    };
    const client = db();
    if (client) client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const signOut = $("#cicOwnerSignOut");
        if (signOut) signOut.style.display = "none";
      }
      if (session && session.user) window.setTimeout(checkExistingSession, 100);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
