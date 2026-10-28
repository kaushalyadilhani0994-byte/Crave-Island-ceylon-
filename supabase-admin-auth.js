/* CRAVE ISLAND CEYLON — real Supabase email OTP owner authentication.
 * No browser-only demo code grants access. Database RLS remains authoritative.
 */
(function () {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
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
  const OWNER_EMAILS = ["kaushalyadilhani0994@gmail.com", "kaushalyadilhanidissanayake@gmail.com"];
  function isOwnerEmail(email) {
    return OWNER_EMAILS.includes(String(email||"").trim().toLowerCase());
  }
  // Keep the original bottom-bar Admin entry; do not add a separate floating shortcut.
  function syncOwnerAdminShortcut(visible) {
    const shortcut = document.getElementById("cicOwnerAdminShortcut");
    if (shortcut) shortcut.remove();
  }
  function setOwnerNavVisible(visible) {
    const bottom = document.querySelector(".bottom");
    const adminButton = bottom && bottom.querySelector(".nav:last-child");
    if (visible) {
      document.body.classList.add("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.setProperty("grid-template-columns", "repeat(7,minmax(0,1fr))", "important");
      if (adminButton) adminButton.style.setProperty("display", "flex", "important");
      syncOwnerAdminShortcut(true);
    } else {
      document.body.classList.remove("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.removeProperty("grid-template-columns");
      if (adminButton) adminButton.style.removeProperty("display");
      syncOwnerAdminShortcut(false);
    }
  }
  async function isApprovedOwner(user) {
    const client=db(); if(!client||!user)return false;
    if(!isOwnerEmail(user.email))return false;
    const {data,error}=await client.from("staff_profiles").select("role,approved").eq("id",user.id).maybeSingle();
    return !error&&!!data&&data.role==="owner"&&data.approved===true;
  }
  function install() {
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
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
    if(intro)intro.textContent="Enter one of the owner's approved email addresses and request a 6-digit code. Only an approved owner account can open live tools.";
    const note=$(".access-note",modal);
    if(note)note.textContent="Secure email OTP sign-in. Only the approved owner email accounts with database approval can open live catalogue tools.";
    modal.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target===email||e.target===otp)){e.preventDefault();e.target===email?sendCode():verifyCode();}});
  }
  async function sendCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim().toLowerCase();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!isOwnerEmail(email))return status("This email is not on the owner's allowed email list.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)status("Could not send a sign-in code. Check the email address and Supabase Auth email configuration, then try again.",true);
      else status("OTP request sent. Check this email inbox and spam folder for the 6-digit code. If this is the newly added owner email, its database owner approval must also be completed before Admin can open.");
    }catch(e){status("Could not request a code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Send 6-digit OTP";}}
  }
  async function verifyCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim().toLowerCase(), token=($("#adminOtp")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!isOwnerEmail(email))return status("This email is not on the owner's allowed email list.",true);
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
        status("This email is allowed for owner setup, but its Supabase owner profile is not yet approved. Complete the owner-profile approval before opening Admin.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}
      status("Owner verified. Opening the original CRAVE Control Room…");
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
      openOwnerDashboard();
    }catch(e){status("Could not verify the code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Verify OTP & open admin";}}
  }
  function installUnifiedLiveTools(){
    if(document.getElementById("controlRoomModal"))document.body.classList.add("cic-owner-shortcuts-unified");
  }
  function openOwnerDashboard(){
    const dashboard=$("#cicOwnerDashboard");
    if(dashboard)dashboard.remove();
    if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
    installUnifiedLiveTools();
    const control=document.getElementById("controlRoomModal");
    if(typeof window.roleOpen==="function"){try{window.roleOpen("overview");}catch(_){}}
    window.setTimeout(()=>{
      const isOpen=control&&(control.classList.contains("open")||control.getAttribute("aria-hidden")==="false"||(control.style.display&&control.style.display!=="none"));
      if(control&&!isOpen){
        if(typeof window.openModal==="function"){try{window.openModal("controlRoomModal");}catch(_){}}
        const opened=control.classList.contains("open")||control.getAttribute("aria-hidden")==="false"||(control.style.display&&control.style.display!=="none");
        if(!opened){control.classList.add("open");control.setAttribute("aria-hidden","false");control.style.display="";}
      }
      installUnifiedLiveTools();
    },100);
    if(control){status("Owner verified. Opening the original CRAVE Control Room…");return;}
    status("Owner sign-in succeeded, but the original Control Room did not load. Refresh the page and try again.",true);
  }
  window.CIC_OPEN_OWNER_DASHBOARD = openOwnerDashboard;
  async function handlePendingOwnerSession(session){
    if(!session||!session.user||handlingPendingOwnerSession)return;
    handlingPendingOwnerSession=true;
    try{
      if(!(await isApprovedOwner(session.user))){
        try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
        await recordDeniedOwnerAttempt(); await db().auth.signOut();
        if(typeof window.openAdminAccess==="function")window.openAdminAccess();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const modal=$("#adminAccessModal");if(modal)modal.style.display="none";}
      openOwnerDashboard();
    }catch(_){status("Could not verify the owner session. Please reopen Admin and try again.",true);}
    finally{handlingPendingOwnerSession=false;}
  }
  async function wire(){
    install();
    const original=window.openAdminAccess;
    window.openAdminAccess=function(){
      // Let the original entry point check Supabase's persisted session first.
      // It opens the existing Control Room only for an approved owner; everyone
      // else is shown the secure OTP panel. sessionStorage must not be the gate,
      // because it can reset while Supabase's authenticated session remains valid.
      if(typeof original==="function"){
        try{
          const result=original.apply(this,arguments);
          if(result&&typeof result.catch==="function")result.catch(()=>{});
        }catch(_){}
      }else if(typeof window.openModal==="function")window.openModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="";}
      const s=$("#cicOwnerAuthStatus");if(s)s.hidden=true;
    };
    const ownerEntryTargets=[document.querySelector(".hero-copy h2"),document.querySelector(".hero-copy"),document.querySelector("header .logo"),document.querySelector(".brand-logo"),document.querySelector("[data-brand-logo]")].filter((el,index,all)=>el&&all.indexOf(el)===index);
    ownerEntryTargets.forEach(target=>{
      if(target.dataset.cicOwnerTrigger)return;target.dataset.cicOwnerTrigger="1";
      let taps=0,timer=0;
      target.addEventListener("click",()=>{taps++;window.clearTimeout(timer);timer=window.setTimeout(()=>{taps=0;},2600);if(taps>=5){taps=0;window.openAdminAccess();}});
    });
    try{
      const ownerUrl=new URL(window.location.href);
      if(ownerUrl.searchParams.get("owner-access")==="1"){
        ownerUrl.searchParams.delete("owner-access");
        history.replaceState(history.state,"",ownerUrl.pathname+ownerUrl.search+ownerUrl.hash);
        // Reuse the existing Control Room when this browser already has a
        // verified owner session; only show the sign-in panel when needed.
        window.setTimeout(async()=>{
          let verified=false;
          try{verified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
          const client=db();
          if(verified&&client){
            try{
              const {data}=await client.auth.getSession();
              if(data&&data.session&&await isApprovedOwner(data.session.user)){
                setOwnerNavVisible(true);
                openOwnerDashboard();
                return;
              }
            }catch(_){}
          }
          window.openAdminAccess();
        },350);
      }
    }catch(_){}
    window.requestAdminOtp=sendCode;window.verifyAdminOtpDemo=function(){verifyCode();};
    const client=db();
    if(client){
      client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){setOwnerNavVisible(false);try{sessionStorage.removeItem("cicOwnerOtpVerified");}catch(_){}}
        if(session&&session.user)window.setTimeout(async()=>{
          let otpVerified=false;try{otpVerified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
          if(otpVerified&&await isApprovedOwner(session.user)){installUnifiedLiveTools();setOwnerNavVisible(true);}
          else setOwnerNavVisible(false);
        },250);
      });
      const url=new URL(window.location.href);
      const hasAuthCallback=url.searchParams.has("code")||url.hash.includes("access_token=")||url.hash.includes("refresh_token=")||url.searchParams.has("error_description")||url.searchParams.has("error");
      if(hasAuthCallback){
        // Supabase's email-link callback may be the step that establishes the
        // owner's persisted session. Never sign out before that session is
        // checked; doing so destroys a valid owner login and sends the owner
        // back to the OTP screen instead of the original Control Room.
        window.setTimeout(async()=>{
          try{
            const {data,error}=await client.auth.getSession();
            const session=!error&&data&&data.session?data.session:null;
            if(session&&session.user&&await isApprovedOwner(session.user)){
              try{sessionStorage.setItem("cicOwnerOtpVerified","1");localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
              setOwnerNavVisible(true);
              if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
              openOwnerDashboard();
            }else if(session&&session.user){
              await recordDeniedOwnerAttempt();
              await client.auth.signOut();
              setOwnerNavVisible(false);
              try{sessionStorage.removeItem("cicOwnerOtpVerified");localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
            }
          }catch(_){}
          // Remove one-time callback parameters only after Supabase has had
          // an opportunity to restore the session. Keep the app path intact.
          try{history.replaceState(history.state,"",url.origin+url.pathname);}catch(_){}
        },500);
      }
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();