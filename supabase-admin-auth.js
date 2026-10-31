/* CRAVE ISLAND CEYLON — real Supabase email OTP owner authentication.
 * No browser-only demo code grants access. Database RLS remains authoritative.
 */
(function () {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  let handlingPendingOwnerSession = false;
  // Preserve a verified owner nav across temporary profile-query failures and nav re-renders.
  let approvedOwnerUserId = null;
  let ownerNavVerified = false;
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
  const OWNER_EMAILS = ["kaushalyadilhani0994@gmail.com", "kaushalyadhanidissanayake@gmail.com"];
  function isOwnerEmail(email) {
    return OWNER_EMAILS.includes(String(email||"").trim().toLowerCase());
  }
  // Keep the original bottom-bar Admin entry; do not add a separate floating shortcut.
  function syncOwnerAdminShortcut(visible) {
    const shortcut = document.getElementById("cicOwnerAdminShortcut");
    if (shortcut) shortcut.remove();
  }
  function setOwnerNavVisible(visible) {
    ownerNavVerified = !!visible;
    const bottom = document.querySelector(".bottom");
    if (!bottom) return;
    // Reuse the existing Admin item across older V18 nav variants.
    let adminButton = bottom.querySelector('[onclick*="openAdminAccess"],[data-nav="admin"],#cicOwnerAdminNav');
    if (!adminButton) {
      adminButton = Array.from(bottom.querySelectorAll(".nav,button,a")).find(el =>
        /(^|\\s)Admin(\\s|$)/i.test((el.getAttribute("aria-label") || el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim())
      );
    }
    // If this storefront revision has no Admin item, create one. It remains
    // hidden until the Supabase session AND approved-owner profile are verified.
    if (!adminButton) {
      adminButton = document.createElement("button");
      adminButton.type = "button";
      adminButton.id = "cicOwnerAdminNav";
      adminButton.className = "nav";
      adminButton.setAttribute("data-nav", "admin");
      adminButton.setAttribute("aria-label", "Admin");
      adminButton.innerHTML = '<span aria-hidden="true" style="font-size:19px;line-height:1">♙</span><span class="nav-label">Admin</span>';
      adminButton.addEventListener("click", function () {
        if (typeof window.openAdminAccess === "function") window.openAdminAccess();
      });
      bottom.appendChild(adminButton);
    }
    if (visible) {
      adminButton.hidden = false;
      adminButton.removeAttribute("aria-hidden");
      document.body.classList.add("cic-owner-shortcuts-unified");
      bottom.style.setProperty("grid-template-columns", "repeat(7,minmax(0,1fr))", "important");
      adminButton.style.setProperty("display", "flex", "important");
      syncOwnerAdminShortcut(true);
    } else {
      adminButton.hidden = true;
      adminButton.setAttribute("aria-hidden", "true");
      document.body.classList.remove("cic-owner-shortcuts-unified");
      bottom.style.removeProperty("grid-template-columns");
      adminButton.style.setProperty("display", "none", "important");
      syncOwnerAdminShortcut(false);
    }
  }
  async function isApprovedOwner(user) {
    const client=db(); if(!client||!user)return false;
    if(!isOwnerEmail(user.email)){approvedOwnerUserId=null;return false;}
    const {data,error}=await client.from("staff_profiles").select("role,approved").eq("id",user.id).maybeSingle();
    // A temporary network/RLS query error must not revoke an already verified
    // owner nav. Only a successful negative profile result or SIGNED_OUT does.
    if(error)return approvedOwnerUserId===user.id;
    const approved=!!data&&data.role==="owner"&&data.approved===true;
    approvedOwnerUserId=approved?user.id:null;
    return approved;
  }
  async function getApprovedTeamProfile(user){
    const client=db();if(!client||!user)return null;
    const {data,error}=await client.from("staff_profiles").select("id,email,display_name,role,approved,permissions").eq("id",user.id).maybeSingle();
    if(error||!data||data.approved!==true||data.role==="owner")return null;
    return data;
  }
  function install() {
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    // Restore the public QR Passport destination in the mobile bar; Admin remains owner-only.
    if(!document.getElementById("cic-nav-qr-visibility-fix")){const st=document.createElement("style");st.id="cic-nav-qr-visibility-fix";st.textContent=".bottom .nav[onclick*=\"qrModal\"]{display:grid!important;visibility:visible!important;pointer-events:auto!important}.bottom .nav-qr-passport .nav-label{font-size:clamp(10px,2.7vw,12px);letter-spacing:-.3px}.bottom .nav-settings svg{stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}@media(max-width:520px){.bottom{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:2px!important;padding:7px 5px!important;box-sizing:border-box!important}.bottom .nav{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important;min-width:0!important;width:100%!important;padding:7px 1px 5px!important;margin:0!important;overflow:hidden!important}.bottom .nav svg{width:19px!important;height:19px!important;flex:0 0 19px!important}.bottom .nav-label{display:block!important;max-width:100%!important;font-size:clamp(8px,2.25vw,10px)!important;line-height:1.05!important;letter-spacing:-.25px!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important}.bottom .nav-sub{display:none!important}.bottom .nav-qr-passport .nav-label{font-size:0!important}.bottom .nav-qr-passport .nav-label:after{content:\"QR\";font-size:10px;letter-spacing:0}.bottom .nav-settings .nav-label{font-size:clamp(8px,2.1vw,9px)!important}}";document.head.appendChild(st);const q=document.querySelector(".bottom .nav-qr-passport .nav-label");if(q)q.textContent="QR";}
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
    modal.querySelectorAll(".role-grid-v9,.role-grid,.role-workspace,#roleWorkspace,.permission-list,#permissionList,.invite-box,.demo-warning,.role-card,.role-option,.role-selector,.access-roles,.team-invite,.team-invitation,.admin-workspace,.legacy-admin-workspace")
      .forEach(el=>{el.hidden=true;el.setAttribute("aria-hidden","true");el.style.setProperty("display","none","important");});
    // Hide legacy role and demo copy so the owner sees only the secure sign-in form.
    modal.querySelectorAll("h1,h2,h3,h4,p,div,section,details").forEach(el=>{
      if(el.closest(".cic-owner-login-sheet"))return;
      const label=(el.innerText||el.textContent||"").replace(/\s+/g," ").trim();
      if(label.length>0&&label.length<260&&/Main Admin|Supervisor|assigned daily tasks|Owner approval flow|Demo limitation|local preview only|Full business control|Access boundary/i.test(label)){
        el.hidden=true;el.setAttribute("aria-hidden","true");el.style.setProperty("display","none","important");
      }
    });
    email.placeholder="Approved owner email";
    email.autocomplete="email";
    otp.type="text"; otp.inputMode="numeric"; otp.maxLength=6; otp.pattern="[0-9]{6}"; otp.autocomplete="one-time-code"; otp.placeholder="Enter code if the email contains one";
    const label=$('label[for="adminOtp"]',modal); if(label)label.textContent="6-digit one-time code";
    const buttons=actions.querySelectorAll("button");
    if(buttons[0]){buttons[0].textContent="Send secure sign-in email";buttons[0].type="button";buttons[0].onclick=sendCode;}
    if(buttons[1]){buttons[1].textContent="Verify code & open Admin";buttons[1].type="button";buttons[1].onclick=verifyCode;}
    if(!$("#cicOwnerAuthStatus",modal)){
      const s=document.createElement("div");s.id="cicOwnerAuthStatus";s.hidden=true;s.setAttribute("role","status");s.setAttribute("aria-live","polite");actions.insertAdjacentElement("afterend",s);
    }
    const intro=$(".muted-note",modal);
    if(intro)intro.textContent="Enter an approved owner email and request a secure sign-in email. Depending on the Supabase email template, use the 6-digit code here or tap the sign-in link in the email. Only an approved owner account can open live tools.";
    const note=$(".access-note",modal);
    if(note)note.textContent="Secure email sign-in. A code or sign-in link may be delivered depending on the configured email template; database owner approval is always required.";
    modal.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target===email||e.target===otp)){e.preventDefault();e.target===email?sendCode():verifyCode();}});
  }
  async function sendCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim().toLowerCase();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email)return status('Enter your owner or team email address.',true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)status("Could not send a sign-in code. Check the email address and Supabase Auth email configuration, then try again.",true);
      else status("Secure sign-in email requested. Check your inbox and spam folder. If it contains a 6-digit code, enter it below; if it contains a sign-in link, tap that link and return to this app. Owner database approval is still required.");
    }catch(e){status("Could not request a code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Send secure sign-in email";}}
  }
  async function verifyCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim().toLowerCase(), token=($("#adminOtp")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!isOwnerEmail(email))return status("This email is not on the owner's allowed email list.",true);
    if(!/^\d{6}$/.test(token))return status("Enter the 6-digit code if your email contains one. If the email contains a sign-in link instead, tap that link and return to this app; the app will verify the owner account.",true);
    const btn=$(".login-actions button:nth-child(2)");
    if(btn){btn.disabled=true;btn.textContent="Verifying…";}
    try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
    try{
      const {data,error}=await client.auth.verifyOtp({email,token,type:"email"});
      if(error||!data.user){status("The code could not be verified. Check it or request a fresh sign-in email.",true);return;}
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      if(await isApprovedOwner(data.user)){
        try{sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}
        status("Main Admin verified. Opening the original CRAVE Control Room…");
        setOwnerNavVisible(true);
        if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
        else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
        openOwnerDashboard();
        return;
      }
      const teamProfile=await getApprovedTeamProfile(data.user);
      if(teamProfile&&typeof window.openApprovedTeamWorkspace==="function"){
        if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
        else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
        window.openApprovedTeamWorkspace(teamProfile);
        return;
      }
      await recordDeniedOwnerAttempt();
      await client.auth.signOut();
      status("This account is not an approved CRAVE team member. Ask Main Admin to approve access first.",true);
    }catch(e){status("Could not verify the code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Verify code & open Admin";}}
  }
  function installUnifiedLiveTools(){
    const control=document.getElementById("controlRoomModal");
    if(!control)return;
    document.body.classList.add("cic-owner-shortcuts-unified");

    // Keep the original Control Room as the single owner workspace.
    // Live modules retain their own session/RLS checks; only their launch
    // buttons are relocated here so they no longer float over the storefront.
    let hub=document.getElementById("cicOwnerToolsHub");
    if(!hub){
      hub=document.createElement("section");
      hub.id="cicOwnerToolsHub";
      hub.setAttribute("aria-label","Owner tools");
      hub.innerHTML='<h4>Live owner tools</h4><p>Manage your live store from this Control Room.</p><div class="cic-owner-tool-grid"><button type="button" data-cic-launch="catalogue">Catalogue & products</button><button type="button" data-cic-launch="orders">Orders & fulfilment</button><button type="button" data-cic-launch="passports">QR product passports</button><button type="button" data-cic-launch="alerts">Owner alerts</button></div><div class="cic-owner-tool-status" role="status" aria-live="polite"></div>';
      const tabs=control.querySelector(".admin-tabs");
      if(tabs)tabs.insertAdjacentElement("afterend",hub);
      else control.querySelector(".sheet")?.prepend(hub);
      hub.addEventListener("click",function(event){
        const button=event.target.closest("[data-cic-launch]");
        if(!button)return;
        const kind=button.dataset.cicLaunch;
        const selectors={
          catalogue:["#cicOwnerCatalogueButton"],
          orders:["#cicOwnerOrdersButton"],
          passports:["#cicPassportButton"],
          alerts:["#cicOwnerAlertsButton","#cicOwnerAlertButton","#cicAlertsButton"]
        };
        let target=null;
        for(const selector of (selectors[kind]||[])){target=document.querySelector(selector);if(target)break;}
        if(!target&&kind==="alerts"){
          target=Array.from(document.querySelectorAll("button")).find(el=>/owner\s*alerts/i.test(el.textContent||""));
        }
        const status=hub.querySelector(".cic-owner-tool-status");
        if(target){target.click();if(status)status.textContent="Opened "+button.textContent.trim()+".";}
        else if(status)status.textContent="This tool is still connecting. Close and reopen Control Room in a moment.";
      });
      const style=document.createElement("style");
      style.id="cic-owner-tools-hub-style";
      style.textContent="#cicOwnerToolsHub{margin:12px 0;padding:14px;border:1px solid #d4af37;border-radius:14px;background:#fffaf1;color:#2c1a14}#cicOwnerToolsHub h4{font:400 21px Georgia,serif;margin:0 0 4px}#cicOwnerToolsHub p{font-size:11px;color:#78675c;margin:0 0 10px}#cicOwnerToolsHub .cic-owner-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}#cicOwnerToolsHub button{border:1px solid #d4af37;background:#2c1a14;color:#fffaf1;border-radius:10px;padding:11px 9px;font-size:12px;font-weight:700}#cicOwnerToolsHub .cic-owner-tool-status{font-size:10px;color:#66564d;margin-top:8px;min-height:12px}#cicOwnerToolsHub button:focus-visible{outline:3px solid #d4af37;outline-offset:2px}@media(max-width:380px){#cicOwnerToolsHub .cic-owner-tool-grid{grid-template-columns:1fr}}";
      document.head.appendChild(style);
    }

    const relocate=function(){
      const known=[
        ["#cicOwnerCatalogueButton","catalogue"],
        ["#cicOwnerOrdersButton","orders"],
        ["#cicPassportButton","passports"]
      ];
      known.forEach(([selector,kind])=>{
        const button=document.querySelector(selector);
        if(button){
          button.hidden=true;
          button.style.setProperty("display","none","important");
          button.setAttribute("aria-hidden","true");
        }
      });
      const alerts=Array.from(document.querySelectorAll("button")).find(el=>/owner\s*alerts/i.test(el.textContent||"")&&!hub.contains(el));
      if(alerts){alerts.hidden=true;alerts.style.setProperty("display","none","important");alerts.setAttribute("aria-hidden","true");}
    };
    relocate();
    if(!window.__cicOwnerToolsObserver){
      window.__cicOwnerToolsObserver=new MutationObserver(()=>relocate());
      window.__cicOwnerToolsObserver.observe(document.body,{childList:true,subtree:true});
    }
  }
  async function openOriginalControlRoom(){
    // Return the owner to the existing V18 Control Room instead of adding another dashboard layer.
    const client=db();
    if(!client){setOwnerNavVisible(false);status("Owner verification is unavailable. Please sign in again.",true);return;}
    try{
      const {data,error}=await client.auth.getUser();
      if(error||!data||!data.user||!(await isApprovedOwner(data.user))){
        setOwnerNavVisible(false);
        status("Owner access denied. Sign in with an approved owner account.",true);
        return;
      }
    }catch(_){setOwnerNavVisible(false);status("Owner verification failed. Please sign in again.",true);return;}
    const extra=document.getElementById("cicOwnerDashboard");
    if(extra)extra.remove();
    setOwnerNavVisible(true);
    if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
    if(typeof window.openModal==="function")window.openModal("controlRoomModal");
    else{
      const control=document.getElementById("controlRoomModal");
      if(control){control.classList.add("open");control.style.display="flex";}
    }
    if(typeof window.showAdminView==="function")window.showAdminView("overview");
    // Keep live catalogue, orders, QR passports and alerts inside the existing Control Room.
    installUnifiedLiveTools();
  }
  function addOwnerMenuReturnButton(dashboard){
    const control=document.getElementById("controlRoomModal");
    const head=control&&control.querySelector(".sheet-head");
    if(!control||!head||document.getElementById("cicReturnOwnerMenu"))return;
    const button=document.createElement("button");
    button.id="cicReturnOwnerMenu";
    button.type="button";
    button.textContent="← Admin menu";
    button.setAttribute("aria-label","Return to the owner Admin menu");
    button.style.cssText="border:1px solid #d4af37;border-radius:9px;padding:8px 10px;background:#fff8e7;color:#2c1a14;font-weight:700;margin-right:8px;min-height:40px";
    const close=head.querySelector(".close");
    if(close)head.insertBefore(button,close);else head.appendChild(button);
    button.addEventListener("click",function(){
      if(typeof window.closeModal==="function")window.closeModal("controlRoomModal");
      else{control.classList.remove("open");control.style.display="none";}
      dashboard.style.display="block";
      dashboard.scrollTop=0;
    });
  }
  async function openOwnerDashboard(){
    // Keep the original V18 Control Room as the only owner admin workspace.
    // Access is re-verified by openOriginalControlRoom before it is displayed.
    return openOriginalControlRoom();
  }

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
  async function waitForSupabaseClient(timeoutMs=10000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const client=db();
      if(client)return client;
      await new Promise(resolve=>window.setTimeout(resolve,100));
    }
    return null;
  }

  async function wire(){
    // Hide the customer-facing Admin nav immediately on startup, before any
    // persisted session or auth-state callback is processed.
    setOwnerNavVisible(false);
    install();
    // V18 may rebuild the bottom navigation after auth has completed. Re-attach
    // the owner-only Admin entry if that happens, using the last verified state.
    if(!window.__cicOwnerNavObserver){
      window.__cicOwnerNavObserver=new MutationObserver(()=>{
        const bottom=document.querySelector(".bottom");
        if(bottom && !bottom.querySelector("#cicOwnerAdminNav") && !bottom.querySelector('[onclick*="openAdminAccess"],[data-nav="admin"]')){
          setOwnerNavVisible(ownerNavVerified);
        }
      });
      window.__cicOwnerNavObserver.observe(document.documentElement,{childList:true,subtree:true});
    }
    if(!window.__cicOwnerNavGuard){
      // Some legacy V18 UI scripts update nav styles after auth; reconcile only
      // when the rendered visibility differs from the verified owner state.
      window.__cicOwnerNavGuard=window.setInterval(()=>{
        const bottom=document.querySelector(".bottom");
        if(!bottom)return;
        const item=bottom.querySelector('#cicOwnerAdminNav,[data-nav="admin"],[onclick*="openAdminAccess"]');
        const currentlyVisible=!!item&&!item.hidden&&getComputedStyle(item).display!=="none";
        if(currentlyVisible!==ownerNavVerified)setOwnerNavVisible(ownerNavVerified);
      },1200);
    }
    // A customer must never see owner tools, but the owner still needs a
    // reliable way to reach the sign-in form before an authenticated session
    // exists. Do not depend on a legacy inline openAdminAccess implementation.
    window.openAdminAccess=async function(){
      const client=db();
      if(client){
        try{
          const {data,error}=await client.auth.getSession();
          const session=!error&&data&&data.session?data.session:null;
          if(session&&session.user&&await isApprovedOwner(session.user)){
            setOwnerNavVisible(true);
            await openOwnerDashboard();
            return;
          }
        }catch(_){}
      }
      let modal=$("#adminAccessModal");
      if(!modal){
        modal=document.createElement("div");
        modal.id="adminAccessModal";
        modal.className="modal";
        modal.innerHTML='<div class="sheet cic-owner-login-sheet"><div class="sheet-head"><h3>Owner Sign In</h3><button class="close" type="button" aria-label="Close owner sign in">×</button></div><p class="muted-note">Sign in with an approved owner email to open the original CRAVE Control Room. Customers cannot access owner tools.</p><div class="form-grid cic-owner-login-fields"><div class="field full"><label for="adminEmail">Owner email</label><input id="adminEmail" type="email" autocomplete="email" placeholder="Approved owner email"></div><div class="field full"><label for="adminOtp">6-digit one-time code</label><input id="adminOtp" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Enter code from your email"></div></div><div class="login-actions"><button class="goldbtn" type="button">Send secure sign-in email</button><button class="gold-outline" type="button">Verify code &amp; open Admin</button></div><div class="access-note">Only an approved owner account can open the Control Room.</div></div>';
        document.body.appendChild(modal);
        modal.querySelector(".close")?.addEventListener("click",()=>modal.classList.remove("open"));
        modal.addEventListener("click",event=>{if(event.target===modal)modal.classList.remove("open");});
      }
      install();
      modal.classList.add("open");
      modal.setAttribute("aria-hidden","false");
      const statusEl=$("#cicOwnerAuthStatus",modal);
      if(statusEl)statusEl.hidden=true;
      window.setTimeout(()=>$("#adminEmail",modal)?.focus(),80);
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
          if(client){
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
    // The storefront bridge may initialize Supabase after this auth module.
    // Wait briefly so persisted sessions and email-link callbacks are not missed.
    const client=await waitForSupabaseClient();
    if(client){
      client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){approvedOwnerUserId=null;setOwnerNavVisible(false);try{sessionStorage.removeItem("cicOwnerOtpVerified");}catch(_){}}
        if(session&&session.user)window.setTimeout(async()=>{
          let otpVerified=false;try{otpVerified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
          if(await isApprovedOwner(session.user)){try{sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}setOwnerNavVisible(true);}
          else{
            setOwnerNavVisible(false);
            const teamProfile=await getApprovedTeamProfile(session.user);
            if(teamProfile&&typeof window.openApprovedTeamWorkspace==="function")window.openApprovedTeamWorkspace(teamProfile);
          }
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
  // Load the owner-only Team & Permissions panel as part of the existing Control Room.
  if(!document.getElementById("cic-team-permissions-script")){
    const teamScript=document.createElement("script");
    teamScript.id="cic-team-permissions-script";
    teamScript.src="/supabase-team-permissions.js";
    teamScript.defer=true;
    document.head.appendChild(teamScript);
  }
  if(!document.getElementById("cic-team-workspace-script")){
    const staffScript=document.createElement("script");staffScript.id="cic-team-workspace-script";staffScript.src="/supabase-team-workspace.js";staffScript.defer=true;document.head.appendChild(staffScript);
  }
})();