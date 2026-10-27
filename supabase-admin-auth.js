/* CRAVE ISLAND CEYLON — real Supabase email OTP owner authentication.
 * No browser-only demo code grants access. Database RLS remains authoritative.
 */
(function () {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  // Prevent duplicate auth callbacks while processing an owner magic-link return.
  let handlingPendingOwnerSession = false;
  function status(message, bad=false) {
    const el=$("#cicOwnerAuthStatus");
    if(!el)return;
    el.textContent=message;
    el.hidden=false;
    el.style.cssText="margin-top:10px;padding:10px 12px;border-radius:9px;background:"+(bad?"#f8deda":"#f0e5d4")+";color:#2C1A14;font-size:12px;line-height:1.5";
  }
  async function recordDeniedOwnerAttempt(){
    const client=db();
    if(!client)return;
    try{await client.functions.invoke("owner-alert-notify",{body:{action:"log_denied_owner_access"}});}catch(_){}
  }
  const OWNER_EMAIL = "kaushalyadilhani0994@gmail.com";
  function setOwnerNavVisible(visible) {
    const bottom = document.querySelector(".bottom");
    const adminButton = bottom && bottom.querySelector(".nav:last-child");
    if (visible) {
      document.body.classList.add("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.setProperty("grid-template-columns", "repeat(7,minmax(0,1fr))", "important");
      if (adminButton) adminButton.style.setProperty("display", "flex", "important");
    } else {
      document.body.classList.remove("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.removeProperty("grid-template-columns");
      if (adminButton) adminButton.style.removeProperty("display");
    }
  }
  async function isApprovedOwner(user) {
    const client=db(); if(!client||!user)return false;
    // Owner UI is allowed only for the exact owner email and the approved database row.
    if(String(user.email||"").trim().toLowerCase() !== OWNER_EMAIL)return false;
    const {data,error}=await client.from("staff_profiles").select("role,approved").eq("id",user.id).maybeSingle();
    return !error&&!!data&&data.role==="owner"&&data.approved===true;
  }
  function install() {
    // Keep the original V18 floating owner tools visible; do not hide them behind
    // a new navigation layout. The secure entry gate is applied after owner approval.
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
    // Hide the old browser-only role selector, local invitation preview, and demo warnings.
    modal.querySelectorAll(".role-grid-v9,.role-workspace,#roleWorkspace,.permission-list,#permissionList,.invite-box,.demo-warning")
      .forEach(el=>{el.style.display="none";});
    email.placeholder="Approved owner email";
    email.autocomplete="email";
    otp.type="text"; otp.inputMode="numeric"; otp.maxLength=6; otp.pattern="[0-9]{6}"; otp.autocomplete="one-time-code"; otp.placeholder="Enter 6-digit code";
    const label=$('label[for="adminOtp"]',modal); if(label)label.textContent="6-digit one-time code";
    const buttons=actions.querySelectorAll("button");
    if(buttons[0]){buttons[0].textContent="Send 6-digit OTP";buttons[0].type="button";buttons[0].onclick=sendCode;}
    if(buttons[1]){buttons[1].textContent="Verify OTP & open admin";buttons[1].type="button";buttons[1].onclick=verifyCode;}
    if(!$("#cicOwnerAuthStatus",modal)){
      const s=document.createElement("div");s.id="cicOwnerAuthStatus";s.hidden=true;s.setAttribute("role","status");s.setAttribute("aria-live","polite");actions.insertAdjacentElement("afterend",s);
    }
    const intro=$(".muted-note",modal);
    if(intro)intro.textContent="Enter the approved owner email and request a 6-digit code. Enter that code here to continue. Only an approved owner can open live tools.";
    const note=$(".access-note",modal);
    if(note)note.textContent="Secure email OTP sign-in. Enter the 6-digit code sent to the approved owner email. Only an approved owner account can open live catalogue tools.";
    modal.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target===email||e.target===otp)){e.preventDefault();e.target===email?sendCode():verifyCode();}});
  }
  async function sendCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the email address of the approved owner account.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)status("Could not send a sign-in code. Check the email address and Supabase Auth email configuration, then try again.",true);
      else { status("OTP request sent. Check the owner email inbox and spam folder for the 6-digit code. If the email contains a sign-in link instead, the Supabase email template still needs to be changed to display the OTP token."); }
    }catch(e){status("Could not request a code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Send 6-digit OTP";}}
  }
  async function verifyCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim(), token=($("#adminOtp")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the owner email used to request the code.",true);
    if(!/^\d{6}$/.test(token))return status("Enter the 6-digit code from the email. If Supabase sent a link instead, its email template must be changed to show the OTP token.",true);
    const btn=$(".login-actions button:nth-child(2)");
    if(btn){btn.disabled=true;btn.textContent="Verifying…";}
    try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
    try{
      const {data,error}=await client.auth.verifyOtp({email,token,type:"email"});
      if(error||!data.user){status("The code could not be verified. Check it or request a fresh sign-in email.",true);return;}
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      if(!(await isApprovedOwner(data.user))){
        await recordDeniedOwnerAttempt();
        await client.auth.signOut();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}
      status("Owner verified. Opening the original CRAVE Control Room…");
      // The storefront modal guard requires this owner-only class before it will open Control Room.
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
      openOwnerDashboard();
    }catch(e){status("Could not verify the code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Verify OTP & open admin";}}
  }
  function installUnifiedLiveTools(){
    // Restore the original V18 Control Room and its original floating owner tools.
    // This class is only added after the signed-in user is confirmed as an approved owner.
    if(document.getElementById("controlRoomModal")){
      document.body.classList.add("cic-owner-shortcuts-unified");
    }
  }
  function openOwnerDashboard(){
    // Keep the original organized Control Room as the single owner entry point.
    const dashboard=$("#cicOwnerDashboard");
    if(dashboard)dashboard.remove();
    if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
    installUnifiedLiveTools();
    const control=document.getElementById("controlRoomModal");
    // Some V18 builds define roleOpen() but only switch the selected panel;
    // they do not open the parent Control Room modal. Try it first, then
    // explicitly open the original modal if it is still closed.
    if(typeof window.roleOpen==="function"){
      try{window.roleOpen("overview");}catch(_){}
    }
    window.setTimeout(()=>{
      const isOpen=control&&(control.classList.contains("open")||
        control.getAttribute("aria-hidden")==="false"||
        (control.style.display&&control.style.display!=="none"));
      if(control&&!isOpen){
        if(typeof window.openModal==="function"){
          try{window.openModal("controlRoomModal");}catch(_){}
        }
        // Final UI fallback: preserve the original modal and only reveal it
        // after the database-approved owner check above has succeeded.
        const opened=control.classList.contains("open")||
          control.getAttribute("aria-hidden")==="false"||
          (control.style.display&&control.style.display!=="none");
        if(!opened){
          control.classList.add("open");
          control.setAttribute("aria-hidden","false");
          control.style.display="";
        }
      }
      installUnifiedLiveTools();
    },100);
    if(control){
      status("Owner verified. Opening the original CRAVE Control Room…");
      return;
    }
    status("Owner sign-in succeeded, but the original Control Room did not load. Refresh the page and try again.",true);
  }
  window.CIC_OPEN_OWNER_DASHBOARD = openOwnerDashboard;

  async function handlePendingOwnerSession(session){
    // Supabase may consume a magic link before this dynamically loaded script
    // attaches its auth listener. Therefore, trust the verified session plus
    // the database owner approval—not a browser-only pending flag—as the gate.
    if(!session||!session.user||handlingPendingOwnerSession)return;
    handlingPendingOwnerSession=true;
    try{
      if(!(await isApprovedOwner(session.user))){
        try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
        await recordDeniedOwnerAttempt();
        await db().auth.signOut();
        if(typeof window.openAdminAccess==="function")window.openAdminAccess();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      // The session has been verified against the approved-owner database row; unlock the original Control Room guard.
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const modal=$("#adminAccessModal");if(modal)modal.style.display="none";}
      openOwnerDashboard();
    }catch(_){
      status("Could not verify the owner session. Please reopen Admin and try again.",true);
    }finally{handlingPendingOwnerSession=false;}
  }
  function wire(){
    install();
    const original=window.openAdminAccess;
    window.openAdminAccess=function(){
      let otpVerified=false;
      try{otpVerified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
      if(otpVerified && typeof original==="function") original.apply(this,arguments);
      else if(typeof window.openModal==="function") window.openModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="";}
      const s=$("#cicOwnerAuthStatus");if(s)s.hidden=true;
      const email=$("#adminEmail");if(email)email.focus({preventScroll:true});
    };
    // Admin stays hidden from customer navigation. Owner can open the secure
    // OTP gate by tapping the main brand title/logo five times, or by using
    // the private owner-entry URL parameter. Database approval + OTP remain required.
    const ownerEntryTargets = [
      document.querySelector(".hero-copy h2"),
      document.querySelector(".hero-copy"),
      document.querySelector("header .logo"),
      document.querySelector(".brand-logo"),
      document.querySelector("[data-brand-logo]")
    ].filter((el, index, all) => el && all.indexOf(el) === index);
    ownerEntryTargets.forEach((target) => {
      if (target.dataset.cicOwnerTrigger) return;
      target.dataset.cicOwnerTrigger = "1";
      let taps = 0, timer = 0;
      target.addEventListener("click", () => {
        taps++;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { taps = 0; }, 2600);
        if (taps >= 5) {
          taps = 0;
          window.openAdminAccess();
        }
      });
    });
    // A discreet fallback for the owner: append ?owner-access=1 to the storefront URL.
    // Remove the parameter immediately so it does not remain in browser history.
    try {
      const ownerUrl = new URL(window.location.href);
      if (ownerUrl.searchParams.get("owner-access") === "1") {
        ownerUrl.searchParams.delete("owner-access");
        history.replaceState(history.state, "", ownerUrl.pathname + ownerUrl.search + ownerUrl.hash);
        window.setTimeout(() => window.openAdminAccess(), 350);
      }
    } catch (_) {}
    window.requestAdminOtp=sendCode;
    window.verifyAdminOtpDemo=function(){verifyCode();};
    const client=db();
    if(client){
      client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT")setOwnerNavVisible(false);
        if(session&&session.user)window.setTimeout(async()=>{
          // A valid Supabase session alone must not unlock owner UI: require the
          // six-digit OTP verification marker from this browser session as well.
          let otpVerified=false;
          try{otpVerified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
          if(otpVerified && await isApprovedOwner(session.user)){
            installUnifiedLiveTools();
            setOwnerNavVisible(true);
          }else{
            setOwnerNavVisible(false);
          }
        },250);
      });
      // Admin is opened only after verifyCode() confirms a six-digit OTP and
      // the database marks this account as an approved owner. A magic-link
      // callback must never open the Control Room automatically.
      const url=new URL(window.location.href);
      const hasAuthCallback=url.searchParams.has("code") || url.hash.includes("access_token=") ||
        url.hash.includes("refresh_token=") || url.searchParams.has("error_description") || url.searchParams.has("error");
      if(hasAuthCallback){
        try{await client.auth.signOut();}catch(_){}
        try{localStorage.removeItem("cicOwnerSignInPending");sessionStorage.removeItem("cicOwnerOtpVerified");}catch(_){}
        history.replaceState(history.state,"",url.origin+url.pathname);
      }
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();
