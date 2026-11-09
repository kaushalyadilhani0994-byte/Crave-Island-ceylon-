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
  const OWNER_EMAILS = ["kaushalyadilhani0994@gmail.com"];
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
    // The secure Admin sign-in entry remains available on the V18 storefront.
    // The owner workspace itself is shown only after server-side approval.
    let adminButton = bottom && (
      bottom.querySelector("#cicOwnerAdminNavEntry") ||
      bottom.querySelector('[onclick*="openAdminAccess"]') ||
      Array.from(bottom.querySelectorAll(".nav")).find(el =>
        /(^|\s)Admin(\s|$)/i.test((el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
      )
    );
    if (visible) {
      document.body.classList.add("cic-owner-shortcuts-unified");
      if (bottom && !adminButton) {
        adminButton = document.createElement("button");
        adminButton.type = "button";
        adminButton.id = "cicOwnerAdminNavEntry";
        adminButton.className = "nav cic-owner-admin-nav";
        adminButton.setAttribute("aria-label", "Open secure owner Admin");
        adminButton.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 19 6v5c0 4.7-2.8 8-7 10-4.2-2-7-5.3-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span class="nav-label">Admin</span>';
        adminButton.addEventListener("click", function () {
          if (typeof window.openAdminAccess === "function") window.openAdminAccess();
        });
        bottom.appendChild(adminButton);
      }
      if (bottom) {
        const count = Math.max(1, Array.from(bottom.querySelectorAll(".nav")).filter(el => !el.classList.contains("nav-qr-passport") && getComputedStyle(el).display !== "none").length);
        bottom.style.setProperty("grid-template-columns", "repeat(" + count + ",minmax(0,1fr))", "important");
      }
      if (adminButton) adminButton.style.setProperty("display", "flex", "important");
      syncOwnerAdminShortcut(true);
    } else {
      // Keep the familiar V18 Admin entry visible on the home screen so the
      // owner can always reach the secure OTP prompt, including on a new
      // browser/device where no local owner-device hint exists. This exposes
      // only the sign-in entry: the owner workspace and all data remain hidden
      // until the server confirms the approved owner session.
      document.body.classList.remove("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.removeProperty("grid-template-columns");
      const privateEntry = document.getElementById("cicOwnerAdminNavEntry");
      if (privateEntry) privateEntry.remove();
      if (adminButton && adminButton.id !== "cicOwnerAdminNavEntry") {
        adminButton.hidden = false;
        adminButton.removeAttribute("aria-hidden");
        adminButton.style.setProperty("display", "flex", "important");
      }
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
    // The public bottom-bar QR is the shop promotion QR. Intercept the legacy
    // qrModal action so this entry no longer opens the old QR destination.
    if(!document.documentElement.dataset.cicShopQrNavBound){
      document.documentElement.dataset.cicShopQrNavBound="1";
      document.addEventListener("click",function(event){
        const qrEntry=event.target&&event.target.closest?event.target.closest(".bottom .nav-qr-passport"):null;
        if(!qrEntry)return;
        event.preventDefault();
        event.stopPropagation();
        if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();
        window.location.assign("/shop-qr.html");
      },true);
    }
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    // Hide owner QR tooling from customer navigation; direct printed passport URLs stay public.
    if(!document.getElementById("cic-hide-customer-qr-tools")){
      const privateNavStyle=document.createElement("style");
      privateNavStyle.id="cic-hide-customer-qr-tools";
      privateNavStyle.textContent=".bottom .nav-qr-passport{display:grid!important;visibility:visible!important;pointer-events:auto!important}@media(max-width:520px){.bottom{grid-template-columns:repeat(7,minmax(0,1fr))!important}}";
      document.head.appendChild(privateNavStyle);
    }

    // Restore the public QR Passport destination in the mobile bar; Admin remains owner-only.
    if(!document.getElementById("cic-nav-qr-visibility-fix")){const st=document.createElement("style");st.id="cic-nav-qr-visibility-fix";st.textContent=".bottom .nav-qr-passport{display:grid!important;visibility:visible!important;pointer-events:auto!important}.bottom .nav-qr-passport .nav-label{font-size:clamp(10px,2.7vw,12px);letter-spacing:-.3px}.bottom .nav-settings svg{stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}@media(max-width:520px){.bottom{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:2px!important;padding:7px 5px!important;box-sizing:border-box!important}.bottom .nav{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:3px!important;min-width:0!important;width:100%!important;padding:7px 1px 5px!important;margin:0!important;overflow:hidden!important}.bottom .nav svg{width:19px!important;height:19px!important;flex:0 0 19px!important}.bottom .nav-label{display:block!important;max-width:100%!important;font-size:clamp(8px,2.25vw,10px)!important;line-height:1.05!important;letter-spacing:-.25px!important;white-space:normal!important;overflow-wrap:anywhere!important;text-align:center!important}.bottom .nav-sub{display:none!important}.bottom .nav-qr-passport .nav-label{font-size:0!important}.bottom .nav-qr-passport .nav-label:after{content:\"QR\";font-size:10px;letter-spacing:0}.bottom .nav-settings .nav-label{font-size:clamp(8px,2.1vw,9px)!important}}";document.head.appendChild(st);const q=document.querySelector(".bottom .nav-qr-passport .nav-label");if(q)q.textContent="QR";}
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
    // Preserve the original V18 role selector and role descriptions.
    // Authentication and database approval checks still gate every admin action.
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
  function selectedAdminRole(){
    const active=document.querySelector("#adminAccessModal .role-card-v9.active");
    const id=active&&active.id||"role-v9-owner";
    return id.replace(/^role-v9-/,"").replace(/^role-/,"")||"owner";
  }
  function requireOwnerRoleForCurrentOtp(){
    const role=selectedAdminRole();
    if(role==="owner")return true;
    const labels={supervisor:"Supervisor",staff:"Staff",media:"Media",accounts:"Accounts"};
    status((labels[role]||"This")+" role's separate secure sign-in and workspace are not enabled yet. Select Main Admin only if you are the approved owner. Choosing a role never grants access.",true);
    return false;
  }
  async function sendCode() {
    if(!requireOwnerRoleForCurrentOtp())return;
    const client=db(), email=($("#adminEmail")?.value||"").trim().toLowerCase();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!isOwnerEmail(email))return status("This email is not on the owner's allowed email list.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error){
        // Surface Supabase's non-secret error code/message so delivery failures
        // can be diagnosed instead of showing the same generic message every time.
        const detail=[error.code,error.message].filter(Boolean).join(": ").replace(/[\\r\\n]+/g," ").slice(0,220);
        console.warn("[CRAVE owner sign-in] OTP request rejected", {code:error.code||null,status:error.status||null});
        status("Supabase could not send the owner sign-in email"+(detail?" ("+detail+")":".")+" Check the exact approved owner email, email rate limit, and Auth SMTP/Resend delivery settings. No login code was issued.",true);
      } else {
        status("Supabase accepted the owner sign-in email request. Check Inbox, Spam, Promotions and All Mail. If no message arrives within 2 minutes, do not keep resending; the Auth email delivery log needs checking. Owner approval is still required.");
      }
    }catch(e){
      console.warn("[CRAVE owner sign-in] OTP request connection failure", {name:e&&e.name||"Error"});
      status("Could not reach Supabase Auth to request the owner email. Check the connection and try again.",true);
    }
    finally{if(btn){btn.disabled=false;btn.textContent="Send secure sign-in email";}}
  }
  async function verifyCode() {
    if(!requireOwnerRoleForCurrentOtp())return;
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
      if(!(await isApprovedOwner(data.user))){
        await recordDeniedOwnerAttempt();
        await client.auth.signOut();
        status("This email is allowed for owner setup, but its Supabase owner profile is not yet approved. Complete the owner-profile approval before opening Admin.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");localStorage.setItem("cicOwnerDeviceHint","1");sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}
      status("Owner verified. Opening the original CRAVE Control Room…");
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
      openOriginalControlRoom();
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
      const note=control.querySelector(".muted-note");
      const tabs=control.querySelector(".admin-tabs");
      if(note)note.insertAdjacentElement("afterend",hub);
      else if(tabs)tabs.insertAdjacentElement("afterend",hub);
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
      style.textContent="#controlRoomModal .health-bar{display:none!important}#cicOwnerToolsHub{margin:12px 0;padding:14px;border:1px solid #d4af37;border-radius:14px;background:#fffaf1;color:#2c1a14}#cicOwnerToolsHub h4{font:400 21px Georgia,serif;margin:0 0 4px}#cicOwnerToolsHub p{font-size:11px;color:#78675c;margin:0 0 10px}#cicOwnerToolsHub .cic-owner-tool-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}#cicOwnerToolsHub button{border:1px solid #d4af37;background:#2c1a14;color:#fffaf1;border-radius:10px;padding:11px 9px;font-size:12px;font-weight:700}#cicOwnerToolsHub .cic-owner-tool-status{font-size:10px;color:#66564d;margin-top:8px;min-height:12px}#cicOwnerToolsHub button:focus-visible{outline:3px solid #d4af37;outline-offset:2px}@media(max-width:380px){#cicOwnerToolsHub .cic-owner-tool-grid{grid-template-columns:1fr}}";
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
    // Preserve the original V18 Control Room as the main owner workspace.
    // Verify the current server-side owner session immediately before opening it.
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
    // Mount the existing live modules inside the original Control Room without
    // replacing its original categories, tabs, cards, or navigation.
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
  async function openOwnerAlertsPanel(){
    const client=db();
    if(!client)return;
    try{const {data,error}=await client.auth.getUser();if(error||!data||!data.user||!(await isApprovedOwner(data.user))){status("Owner verification failed. Alerts were not opened.",true);return;}}
    catch(_){status("Could not verify owner access. Alerts were not opened.",true);return;}
    let panel=document.getElementById("cicOwnerAlertsPanel");
    if(!panel){
      const style=document.createElement("style");style.id="cicOwnerAlertsPanelStyle";
      style.textContent=`#cicOwnerAlertsPanel{position:fixed;inset:0;z-index:10004;background:#160f0de8;display:none;overflow:auto;padding:12px;box-sizing:border-box}#cicOwnerAlertsPanel .cic-alert-sheet{box-sizing:border-box;width:min(820px,100%);margin:12px auto;background:#fff8e7;color:#2c1a14;border:1px solid #d4af37;border-radius:16px;padding:16px;font:14px system-ui;box-shadow:0 15px 45px #0005}#cicOwnerAlertsPanel h2{font:400 25px Georgia,serif;margin:0 0 5px}#cicOwnerAlertsPanel .cic-alert-muted{font-size:12px;color:#67564b;line-height:1.5}#cicOwnerAlertsPanel .cic-alert-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#cicOwnerAlertsPanel button{border:1px solid #d4af37;border-radius:9px;background:#2c1a14;color:#fff8e7;padding:9px 12px;font-weight:650;min-height:40px}#cicOwnerAlertsPanel .cic-alert-item{border:1px solid #e1d2bc;border-left:4px solid #c08a42;border-radius:11px;padding:12px;margin:9px 0;background:#fff}#cicOwnerAlertsPanel .cic-alert-item.critical{border-left-color:#b42318}#cicOwnerAlertsPanel .cic-alert-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}#cicOwnerAlertsPanel .cic-alert-severity{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}#cicOwnerAlertsPanel .cic-alert-message{font-size:12px;line-height:1.5;color:#59483e;margin-top:7px;white-space:pre-wrap}#cicOwnerAlertsPanel .cic-alert-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#b42318;margin-right:6px;vertical-align:middle}#cicOwnerAlertsPanel .cic-alert-count{display:inline-flex;min-width:19px;height:19px;align-items:center;justify-content:center;border-radius:99px;background:#b42318;color:white;font:700 10px system-ui;margin-left:6px;padding:0 5px}@media(max-width:420px){#cicOwnerAlertsPanel{padding:5px}#cicOwnerAlertsPanel .cic-alert-sheet{padding:12px;margin:5px auto}}`;
      document.head.appendChild(style);
      panel=document.createElement("div");panel.id="cicOwnerAlertsPanel";panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");panel.setAttribute("aria-label","Owner alerts");
      panel.innerHTML='<section class="cic-alert-sheet"><header class="cic-alert-head"><div><h2>Owner Alerts</h2><div class="cic-alert-muted">Live order, stock, expiry and security alerts · owner-only view.</div></div><button type="button" id="cicAlertsBack">← Admin menu</button></header><div class="cic-alert-actions"><button type="button" id="cicAlertsRefresh">Refresh alerts</button></div><div id="cicAlertsList" aria-live="polite" class="cic-alert-muted">Loading alerts…</div></section>';
      document.body.appendChild(panel);
      const back=()=>{panel.style.display="none";const dashboard=document.getElementById("cicOwnerDashboard");if(history.state&&history.state.cicOwnerDashboard)history.back();else if(dashboard){dashboard.style.display="block";dashboard.scrollTop=0;}};
      panel.addEventListener("click",event=>{if(event.target===panel)back();});
      document.getElementById("cicAlertsBack").addEventListener("click",back);
      document.getElementById("cicAlertsRefresh").addEventListener("click",loadOwnerAlerts);
    }
    panel.style.display="block";
    await loadOwnerAlerts();
  }
  async function refreshOwnerAlertCount(){
    const client=db(),badge=document.getElementById("cicOwnerAlertCount");
    if(!client||!badge)return;
    try{
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth||!auth.user||!(await isApprovedOwner(auth.user))){badge.hidden=true;return;}
      const {count,error}=await client.from("admin_alerts").select("id",{count:"exact",head:true}).eq("status","open");
      if(error){badge.hidden=true;return;}
      badge.textContent=String(count||0);badge.hidden=!count;
    }catch(_){badge.hidden=true;}
  }
  async function loadOwnerAlerts(){
    const panel=document.getElementById("cicOwnerAlertsPanel"),list=document.getElementById("cicAlertsList"),client=db();
    if(!panel||!list||!client)return;
    list.textContent="Loading open owner alerts…";
    try{
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth||!auth.user||!(await isApprovedOwner(auth.user))){panel.style.display="none";list.textContent="Owner access verification failed.";return;}
      const {data,error}=await client.from("admin_alerts").select("id,alert_type,severity,title,message,entity_type,entity_id,status,created_at").eq("status","open").order("created_at",{ascending:false}).limit(100);
      if(error||!Array.isArray(data)){list.textContent="Alerts could not be loaded. Check the owner-only alerts policy and try again.";return;}
      const badge=document.getElementById("cicOwnerAlertCount");
      if(badge){badge.textContent=String(data.length);badge.hidden=data.length===0;}
      const card=document.querySelector("#cicOwnerDashboard [data-alerts-open]");
      if(card)card.setAttribute("aria-label",data.length+" open owner alerts");
      if(!data.length){list.textContent="No open alerts. Your current alert queue is clear.";return;}
      list.innerHTML=data.map(alert=>{
        const critical=alert.severity==="critical";
        return '<article class="cic-alert-item '+(critical?"critical":"")+'"><div class="cic-alert-head"><strong>'+(critical?'<span class="cic-alert-dot" aria-hidden="true"></span>':"")+cicTeamEscape(alert.title)+'</strong><span class="cic-alert-severity">'+cicTeamEscape(alert.severity||"info")+'</span></div><div class="cic-alert-message">'+cicTeamEscape(alert.message)+'</div><div class="cic-alert-muted">'+cicTeamEscape(alert.alert_type||"alert")+' · '+cicTeamEscape(alert.created_at?new Date(alert.created_at).toLocaleString("en-LK",{timeZone:"Asia/Colombo"}):"")+'</div></article>';
      }).join("");
    }catch(_){list.textContent="A connection error prevented alerts from loading.";}
  }
  function cicTeamEscape(value){
    return String(value==null?"":value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }
  async function openOwnerTeamPanel(){
    const client=db();
    if(!client)return;
    try{
      const {data,error}=await client.auth.getUser();
      if(error||!data||!data.user||!(await isApprovedOwner(data.user))){
        status("Owner verification failed. Team information was not opened.",true);
        return;
      }
    }catch(_){status("Could not verify owner access. Team information was not opened.",true);return;}
    let panel=document.getElementById("cicOwnerTeamPanel");
    if(!panel){
      const style=document.createElement("style");
      style.id="cicOwnerTeamPanelStyle";
      style.textContent=`#cicOwnerTeamPanel{position:fixed;inset:0;z-index:10003;background:#160f0de8;display:none;overflow:auto;padding:12px;box-sizing:border-box}#cicOwnerTeamPanel .cic-team-sheet{box-sizing:border-box;width:min(820px,100%);margin:12px auto;background:#fff8e7;color:#2c1a14;border:1px solid #d4af37;border-radius:16px;padding:16px;font:14px system-ui;box-shadow:0 15px 45px #0005}#cicOwnerTeamPanel h2{font:400 25px Georgia,serif;margin:0 0 5px}#cicOwnerTeamPanel .cic-team-muted{font-size:12px;color:#67564b;line-height:1.5}#cicOwnerTeamPanel .cic-team-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}#cicOwnerTeamPanel button{border:1px solid #d4af37;border-radius:9px;background:#2c1a14;color:#fff8e7;padding:9px 12px;font-weight:650;min-height:40px}#cicOwnerTeamPanel .cic-team-member{border:1px solid #e1d2bc;border-radius:11px;padding:12px;margin:9px 0;background:#fff}#cicOwnerTeamPanel .cic-team-member-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}#cicOwnerTeamPanel .cic-team-role{font-size:11px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:#6b4d31}#cicOwnerTeamPanel .cic-team-state{font-size:11px;border-radius:99px;padding:3px 8px;background:#eee4d5}#cicOwnerTeamPanel .cic-team-perms{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}#cicOwnerTeamPanel .cic-team-perms span{font-size:10px;border:1px solid #dfd0bb;border-radius:99px;padding:4px 7px;color:#58483e}#cicOwnerTeamPanel .cic-team-warning{padding:11px;border-radius:10px;background:#f4ead9;color:#5a3b22;font-size:12px;line-height:1.5;margin-top:12px}#cicOwnerTeamPanel .cic-team-invite{border:1px solid #e1d2bc;border-radius:12px;padding:12px;margin:14px 0;background:#fff}#cicOwnerTeamPanel .cic-team-invite h3{margin:0 0 9px;font:400 19px Georgia,serif}#cicOwnerTeamPanel .cic-team-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}#cicOwnerTeamPanel .cic-team-form-grid label{display:block;font-size:11px;font-weight:700;color:#58483e}#cicOwnerTeamPanel input,#cicOwnerTeamPanel select{box-sizing:border-box;width:100%;min-height:40px;margin-top:4px;padding:8px;border:1px solid #d6c7b5;border-radius:8px;background:#fff;color:#2c1a14;font:14px system-ui}#cicOwnerTeamPanel .cic-team-form-grid button{align-self:end}#cicOwnerTeamPanel .cic-team-member-controls{display:grid;grid-template-columns:1fr 1fr auto;align-items:end;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid #eee4d5}#cicOwnerTeamPanel .cic-team-member-controls label{font-size:11px;font-weight:700;color:#58483e}#cicOwnerTeamPanel .cic-team-member-controls button{white-space:nowrap}@media(max-width:520px){#cicOwnerTeamPanel .cic-team-form-grid{grid-template-columns:1fr}#cicOwnerTeamPanel .cic-team-member-controls{grid-template-columns:1fr 1fr}#cicOwnerTeamPanel .cic-team-member-controls button{grid-column:1/-1}}@media(max-width:420px){#cicOwnerTeamPanel{padding:5px}#cicOwnerTeamPanel .cic-team-sheet{padding:12px;margin:5px auto}}`;
      document.head.appendChild(style);
      panel=document.createElement("div");
      panel.id="cicOwnerTeamPanel";
      panel.setAttribute("role","dialog");
      panel.setAttribute("aria-modal","true");
      panel.setAttribute("aria-label","CRAVE team access overview");
      panel.innerHTML='<section class="cic-team-sheet"><header class="cic-team-member-head"><div><h2>Team Access</h2><div class="cic-team-muted">Private owner view · invite staff, assign role-based access and approve accounts.</div></div><button type="button" id="cicTeamClose">← Admin menu</button></header><form id="cicTeamInviteForm" class="cic-team-invite"><h3>Invite a team member</h3><div class="cic-team-form-grid"><label>Email address<input id="cicTeamInviteEmail" type="email" maxlength="254" autocomplete="email" required></label><label>Display name<input id="cicTeamInviteName" maxlength="100" autocomplete="name"></label><label>Role<select id="cicTeamInviteRole"><option value="supervisor">Supervisor</option><option value="staff" selected>Staff</option><option value="media">Media</option><option value="accounts">Accounts</option><option value="star_club">Loyalty / Star Club</option></select></label><button type="submit" id="cicTeamInviteSubmit">Send secure invitation</button></div><div class="cic-team-muted">Invited accounts start pending and cannot use staff tools until you approve them.</div></form><div class="cic-team-actions"><button type="button" id="cicTeamRefresh">Refresh team list</button></div><div id="cicTeamStatus" class="cic-team-muted" role="status" aria-live="polite"></div><div id="cicTeamList" aria-live="polite" class="cic-team-muted">Loading team records…</div><div class="cic-team-warning">Role presets apply the minimum module permissions shown for each job. Accounts access does not include raw customer order records. The Main Admin / Owner account cannot be edited or removed from this panel.</div></section>';
      document.body.appendChild(panel);
      const returnToAdmin=()=>{panel.style.display="none";const dashboard=document.getElementById("cicOwnerDashboard");if(history.state&&history.state.cicOwnerDashboard)history.back();else if(dashboard){dashboard.style.display="block";dashboard.scrollTop=0;}};
      panel.addEventListener("click",event=>{if(event.target===panel)returnToAdmin();});
      document.getElementById("cicTeamClose").addEventListener("click",returnToAdmin);
      document.getElementById("cicTeamRefresh").addEventListener("click",loadOwnerTeamList);
      document.getElementById("cicTeamInviteForm").addEventListener("submit",async event=>{
        event.preventDefault();
        const email=document.getElementById("cicTeamInviteEmail").value.trim().toLowerCase();
        const displayName=document.getElementById("cicTeamInviteName").value.trim();
        const role=document.getElementById("cicTeamInviteRole").value;
        const submit=document.getElementById("cicTeamInviteSubmit");
        const note=document.getElementById("cicTeamStatus");
        const {data:auth,error:authError}=await client.auth.getUser();
        if(authError||!auth||!auth.user||!(await isApprovedOwner(auth.user))){note.textContent="Owner verification failed. Invitation was not sent.";return;}
        submit.disabled=true;submit.textContent="Sending invitation…";note.textContent="Checking owner access and sending invitation…";
        try{
          const {data,error}=await client.functions.invoke("owner-invite-team-member",{body:{email,display_name:displayName,role}});
          if(error||!data||data.ok!==true)throw new Error(data&&data.error?data.error:(error&&error.message)||"Invitation could not be sent.");
          document.getElementById("cicTeamInviteForm").reset();
          note.textContent="Invitation sent to "+email+". The account is pending until you approve it after sign-in.";
          await loadOwnerTeamList();
        }catch(error){note.textContent="Invitation failed: "+String(error&&error.message||"Please try again.").slice(0,180);}
        finally{submit.disabled=false;submit.textContent="Send secure invitation";}
      });
    }
    panel.style.display="block";
    await loadOwnerTeamList();
  }
  function permissionsForTeamRole(role){
    const presets={
      supervisor:{catalogue:["read","create","update"],inventory:["read","update"],orders:["read","update"],dispatch:["read","update"],reports:["read"],tasks:["read","update"]},
      staff:{catalogue:["read"],inventory:["read"],tasks:["read","update"]},
      media:{media:["read","create","update"],star_club:["read","create","update"],certificates:["read"],reports:["read"]},
      accounts:{accounts:["read","create","update","export"],reports:["read","export"]},
      star_club:{star_club:["read","create","update"],reports:["read"]}
    };
    return presets[role]||presets.staff;
  }
  async function loadOwnerTeamList(){
    const panel=document.getElementById("cicOwnerTeamPanel");
    const list=document.getElementById("cicTeamList");
    const client=db();
    if(!panel||!list||!client)return;
    list.textContent="Loading approved team records…";
    try{
      const {data:auth,error:authError}=await client.auth.getUser();
      if(authError||!auth||!auth.user||!(await isApprovedOwner(auth.user))){
        panel.style.display="none";
        list.textContent="Owner access verification failed.";
        return;
      }
      const {data,error}=await client.rpc("owner_list_team_members");
      if(error||!Array.isArray(data)){
        list.textContent="Team records could not be loaded. Check the owner team-list RPC and try again.";
        return;
      }
      if(!data.length){list.textContent="No team profiles yet. Use the invitation form above to add your first staff member.";return;}
      const actionLabels={read:"View",create:"Add",update:"Edit",delete:"Delete",approve:"Approve",export:"Export"};
      const roleOptions=[["supervisor","Supervisor"],["staff","Staff"],["media","Media"],["accounts","Accounts"],["star_club","Loyalty / Star Club"]];
      list.innerHTML=data.map(member=>{
        const permissions=member.permissions&&typeof member.permissions==="object"&&!Array.isArray(member.permissions)?member.permissions:{};
        const badges=Object.entries(permissions).flatMap(([moduleName,actions])=>{
          if(!Array.isArray(actions))return [];
          return actions.filter(action=>typeof action==="string").map(action=>'<span>'+cicTeamEscape(moduleName.replace(/_/g," "))+' · '+cicTeamEscape(actionLabels[action]||action)+'</span>');
        });
        const display=member.display_name||member.email||"Team member";
        const state=member.approved===true?"Approved":"Pending approval";
        const isOwner=member.role==="owner";
        const controls=isOwner?'<div class="cic-team-muted">Main Admin · Full owner access protected</div>':
          '<div class="cic-team-member-controls"><label>Role<select data-team-role="'+cicTeamEscape(member.user_id)+'">'+roleOptions.map(([value,label])=>'<option value="'+value+'" '+(member.role===value?'selected':'')+'>'+label+'</option>').join("")+'</select></label><label><input type="checkbox" data-team-approved="'+cicTeamEscape(member.user_id)+'" '+(member.approved===true?'checked':'')+' style="width:auto;min-height:0;margin-right:5px">Approved access</label><button type="button" data-team-save="'+cicTeamEscape(member.user_id)+'">Save role & access</button></div>';
        return '<article class="cic-team-member"><div class="cic-team-member-head"><div><strong>'+cicTeamEscape(display)+'</strong><div class="cic-team-muted">'+cicTeamEscape(member.email||"No email on profile")+'</div></div><div><div class="cic-team-role">'+cicTeamEscape(member.role||"unassigned")+'</div><div class="cic-team-state">'+state+'</div></div></div><div class="cic-team-perms">'+(badges.length?badges.join(""):'<span>No permissions assigned</span>')+'</div>'+controls+'</article>';
      }).join("");
      list.querySelectorAll("[data-team-save]").forEach(button=>button.addEventListener("click",async()=>{
        const userId=button.getAttribute("data-team-save");
        const roleSelect=list.querySelector('[data-team-role="'+userId+'"]');
        const approvedBox=list.querySelector('[data-team-approved="'+userId+'"]');
        if(!roleSelect||!approvedBox)return;
        const role=roleSelect.value;
        const permissions=permissionsForTeamRole(role);
        if(!window.confirm("Save "+role+" access for this team member?"))return;
        button.disabled=true;button.textContent="Saving…";
        try{
          const {data:auth,error:authError}=await client.auth.getUser();
          if(authError||!auth||!auth.user||!(await isApprovedOwner(auth.user)))throw new Error("Owner verification failed.");
          const {error}=await client.rpc("owner_set_team_member_access",{_user_id:userId,_role:role,_approved:approvedBox.checked,_permissions:permissions});
          if(error)throw error;
          const note=document.getElementById("cicTeamStatus");if(note)note.textContent="Role and approval updated for "+(data.find(x=>x.user_id===userId)?.email||"team member")+".";
          await loadOwnerTeamList();
        }catch(error){const note=document.getElementById("cicTeamStatus");if(note)note.textContent="Access update failed: "+String(error&&error.message||"Please try again.").slice(0,180);button.disabled=false;button.textContent="Save role & access";}
      }));
    }catch(_){list.textContent="A connection error prevented the team list from loading.";}
  }
  async function openOwnerDashboard(){
    // Fail closed even if a customer calls the exported dashboard function manually.
    const client=db();
    if(!client){
      setOwnerNavVisible(false);
      status("Owner verification is unavailable. Please sign in again.",true);
      return;
    }
    try{
      const {data,error}=await client.auth.getUser();
      if(error||!data||!data.user||!(await isApprovedOwner(data.user))){
        const existing=$("#cicOwnerDashboard");
        if(existing)existing.remove();
        setOwnerNavVisible(false);
        status("Owner access denied. Sign in with an approved owner account.",true);
        return;
      }
    }catch(_){
      const existing=$("#cicOwnerDashboard");
      if(existing)existing.remove();
      setOwnerNavVisible(false);
      status("Owner verification failed. Please sign in again.",true);
      return;
    }
    // Restore the original V18 owner dashboard after a fresh server-verified owner check.
    let dashboard=$("#cicOwnerDashboard");
    if(!dashboard){
      if(!$("#cicOwnerDashboardStyle")){
        const style=document.createElement("style");
        style.id="cicOwnerDashboardStyle";
        style.textContent=`
          #cicOwnerDashboard{position:fixed;inset:0;z-index:10001;background:#f6f1ea;color:#2c1a14;overflow:auto;padding:clamp(14px,4vw,28px);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
          #cicOwnerDashboard .cic-dash-wrap{max-width:760px;margin:0 auto}
          #cicOwnerDashboard .cic-dash-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid #e4d7c7;padding-bottom:16px;margin-bottom:18px}
          #cicOwnerDashboard h1{font:400 clamp(27px,6vw,38px)/1.12 Georgia,serif;margin:0 0 7px}
          #cicOwnerDashboard p{color:#59463b;line-height:1.5;margin:0}
          #cicOwnerDashboard .cic-dash-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
          #cicOwnerDashboard .cic-dash-card{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:8px;min-height:112px;padding:16px;border:1px solid #cdbb9f;border-radius:15px;background:#fff;color:#24150f;touch-action:manipulation}
          #cicOwnerDashboard .cic-dash-card strong{font:400 20px Georgia,serif;color:#24150f}
          #cicOwnerDashboard .cic-dash-card span{font-size:13px;color:#59463b;line-height:1.45}
          #cicOwnerDashboard .cic-dash-card:active{transform:scale(.99)}
          #cicOwnerDashboard .cic-alert-count{display:inline-flex;min-width:19px;height:19px;align-items:center;justify-content:center;border-radius:99px;background:#b42318;color:#fff;font:700 10px system-ui;margin-left:6px;padding:0 5px;vertical-align:middle}#cicOwnerDashboard .cic-alert-count[hidden]{display:none}#cicOwnerDashboard .cic-dash-action{border:1px solid #d4af37;border-radius:10px;padding:10px 13px;background:#2c1a14;color:#fff8e7;font-weight:650;touch-action:manipulation}
          #cicOwnerDashboard .cic-dash-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap}
          #cicOwnerDashboard .cic-dash-section{margin-top:20px}
          #cicOwnerDashboard .cic-dash-section h2{font:400 22px Georgia,serif;margin:0 0 10px}
          #cicOwnerDashboard .cic-dash-note{font-size:12px;margin-top:12px;padding:12px;border-radius:12px;background:#efe5d8}
          @media(max-width:430px){#cicOwnerDashboard{padding:12px}#cicOwnerDashboard .cic-dash-top{gap:8px;padding-bottom:12px;margin-bottom:12px}#cicOwnerDashboard .cic-dash-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#cicOwnerDashboard .cic-dash-card{min-height:92px;padding:11px;gap:5px;border-radius:12px}#cicOwnerDashboard .cic-dash-card strong{font:400 16px/1.15 Georgia,serif}#cicOwnerDashboard .cic-dash-card span{font-size:11px;line-height:1.35}#cicOwnerDashboard .cic-dash-section{margin-top:14px}#cicOwnerDashboard .cic-dash-section h2{font-size:20px;margin-bottom:8px}#cicOwnerDashboard .cic-dash-note{font-size:11px;padding:10px}}
        `;
        document.head.appendChild(style);
      }
      dashboard=document.createElement("div");
      dashboard.id="cicOwnerDashboard";
      dashboard.setAttribute("role","dialog");
      dashboard.setAttribute("aria-modal","true");
      dashboard.setAttribute("aria-label","CRAVE ISLAND CEYLON owner dashboard");
      dashboard.innerHTML=`
        <div class="cic-dash-wrap">
          <header class="cic-dash-top"><div><h1>CRAVE ISLAND CEYLON</h1><p>Owner workspace · Manage your business from one place.</p></div><button class="cic-dash-action" type="button" id="cicDashSignOut">Sign out</button></header>
          <section class="cic-dash-section"><h2>Owner Admin · Quick access</h2>
          <div class="cic-dash-grid">
            <button class="cic-dash-card" type="button" data-open="cicOwnerCatalogueButton" data-section="products"><strong>Owner Products</strong><span>Add and update product details, prices, stock and availability.</span></button>
            <button class="cic-dash-card" type="button" data-open="cicOwnerCatalogueButton" data-section="categories"><strong>Owner Categories</strong><span>Create collections and subcategories, and manage visibility.</span></button>
            <button class="cic-dash-card" type="button" data-open="cicOwnerOrdersButton"><strong>Owner Orders</strong><span>Review incoming orders and manage fulfilment.</span></button>
            <button class="cic-dash-card" type="button" data-open="cicPassportButton"><strong>Owner QR Passport</strong><span>Complete verified product passports and print QR labels.</span></button>
            <button class="cic-dash-card" type="button" data-team-open="1"><strong>Team Access</strong><span>View team roles, approval status and current permissions.</span></button>
            <button class="cic-dash-card" type="button" data-alerts-open="1"><strong>Owner Alerts <span id="cicOwnerAlertCount" class="cic-alert-count" hidden>0</span></strong><span>Open order, stock, expiry and security alerts.</span></button>
          </div>
          <p class="cic-dash-note">This workspace is visible only after the approved owner account is verified. Customers do not receive these owner tools.</p></section>
          <div class="cic-dash-footer"><p>Verified owner access · CRAVE ISLAND CEYLON</p><button class="cic-dash-action" type="button" id="cicDashClose">Back to shop</button></div>
        </div>`;
      document.body.appendChild(dashboard);
      // Make the phone/browser Back action close the owner dashboard instead of leaving the app.
      try{history.pushState({cicOwnerDashboard:true},'','#owner-admin');}catch(_){}
      dashboard.addEventListener("click",async e=>{
        const alertsCard=e.target.closest("[data-alerts-open]");
        if(alertsCard){dashboard.style.display="none";try{history.pushState({cicOwnerDashboard:true,cicOwnerTool:true},"","#owner-alerts");}catch(_){}await openOwnerAlertsPanel();return;}
        const teamCard=e.target.closest("[data-team-open]");
        if(teamCard){dashboard.style.display="none";try{history.pushState({cicOwnerDashboard:true,cicOwnerTool:true},"","#owner-team");}catch(_){}await openOwnerTeamPanel();return;}
        const viewCard=e.target.closest("[data-view]");
        if(viewCard){
          const view=viewCard.getAttribute("data-view");
          // Keep the owner menu in the history stack, hidden behind the work area.
          // Android/browser Back then returns to this menu instead of the storefront.
          dashboard.style.display="none";
          try{history.pushState({cicOwnerDashboard:true,cicOwnerTool:true},"","#owner-tool");}catch(_){}
          if(typeof window.openModal==="function")window.openModal("controlRoomModal");
          addOwnerMenuReturnButton(dashboard);
          if(typeof window.showAdminView==="function")window.showAdminView(view);
          return;
        }
        const card=e.target.closest("[data-open]");
        if(card){
          const target=card.getAttribute("data-open");
          const section=card.getAttribute("data-section");
          if(target==="storefront"){dashboard.style.display="none";return;}
          if(target==="mediaModal"||target==="loyaltyModal"||target==="scratchModal"){
            dashboard.style.display="none";
            try{history.pushState({cicOwnerDashboard:true,cicOwnerTool:true},"","#owner-tool");}catch(_){}
            if(typeof window.openModal==="function")window.openModal(target);
            addOwnerMenuReturnButton(dashboard);
            return;
          }
          let tries=0;
          const launch=()=>{
            const b=document.getElementById(target);
            if(b){
              // Preserve the dashboard so Android/browser Back returns to the owner menu.
              dashboard.style.display="none";
              try{history.pushState({cicOwnerDashboard:true,cicOwnerTool:true},"","#owner-tool");}catch(_){}
              addOwnerMenuReturnButton(dashboard);
              b.hidden=false;
              b.click();
              if(section==="categories"||section==="products"){
                const form=document.getElementById(section==="categories"?"cicCategoryForm":"cicProductForm");
                if(form){
                  form.scrollIntoView({behavior:"smooth",block:"start"});
                  const input=form.querySelector("input,select,textarea");
                  if(input)input.focus({preventScroll:true});
                }
              }
              return;
            }
            if(++tries<25){setTimeout(launch,200);return;}
            status("This section is still loading. Please try again in a moment.",true);
          };
          launch();
        }
      });
      $("#cicDashClose").onclick=()=>{
        // Keep the verified owner workspace in memory. Returning from the shop can reopen it without another OTP.
        dashboard.style.display="none";
        if(history.state&&history.state.cicOwnerDashboard)history.back();
      };
      $("#cicDashSignOut").onclick=async()=>{
        const client=db();
        if(client)await client.auth.signOut();
        dashboard.remove();
        try{localStorage.removeItem("cicOwnerSignInPending");sessionStorage.removeItem("cicOwnerOtpVerified");}catch(_){}
        setOwnerNavVisible(false);
        status("You have signed out.");
        if(typeof window.openAdminAccess==="function")window.openAdminAccess();
      };
    }
    dashboard.style.display="block";
    dashboard.scrollTop=0;
    refreshOwnerAlertCount();
  }
  window.addEventListener("popstate",function(event){
    const dashboard=document.getElementById("cicOwnerDashboard");
    if(!dashboard)return;
    if(event.state&&event.state.cicOwnerDashboard){
      // Back from a Control Room/tool panel: close the active work modal and return to Admin, not Home.
      const teamPanel=document.getElementById("cicOwnerTeamPanel");if(teamPanel)teamPanel.style.display="none";const alertsPanel=document.getElementById("cicOwnerAlertsPanel");if(alertsPanel)alertsPanel.style.display="none";
      document.querySelectorAll(".modal.open").forEach(modal=>{if(typeof window.closeModal==="function")window.closeModal(modal.id);else{modal.classList.remove("open");modal.style.display="none";}});
      dashboard.style.display="block";
      dashboard.scrollTop=0;
    }else{
      // Back from the owner menu itself: return to the storefront but preserve the verified dashboard in memory.
      dashboard.style.display="none";
    }
  });
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
      try{localStorage.removeItem("cicOwnerSignInPending");localStorage.setItem("cicOwnerDeviceHint","1");}catch(_){}
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const modal=$("#adminAccessModal");if(modal)modal.style.display="none";}
      openOriginalControlRoom();
    }catch(_){status("Could not verify the owner session. Please reopen Admin and try again.",true);}
    finally{handlingPendingOwnerSession=false;}
  }
  async function wire(){
    // Capture owner intent before the query parameter is cleaned up below.
    // The modal can be injected after the first page scripts have already run.
    const ownerAccessRequested = new URL(window.location.href).searchParams.get("owner-access") === "1";
    let ownerAutoPromptOpened = false;
    const shouldAutoOpenOwner = () => {
      let deviceHint = false;
      try { deviceHint = localStorage.getItem("cicOwnerDeviceHint") === "1"; } catch (_) {}
      return ownerAccessRequested || deviceHint;
    };
    const maybeOpenOwnerPrompt = () => {
      const modal = document.getElementById("adminAccessModal");
      if (ownerAutoPromptOpened || !shouldAutoOpenOwner() ||
          !modal || modal.dataset.cicRealOtp !== "true" ||
          typeof window.openAdminAccess !== "function") return;
      ownerAutoPromptOpened = true;
      window.setTimeout(() => window.openAdminAccess(), 0);
    };
    // Hide the customer-facing Admin nav immediately on startup, before any
    // persisted session or auth-state callback is processed.
    setOwnerNavVisible(false);
    install();
    // Keep observing until the dynamically injected login modal is actually
    // wired. A fixed 20-second timeout could silently disable owner login on
    // slower mobile connections; disconnect as soon as the modal is ready.
    if (!document.getElementById("adminAccessModal")?.dataset.cicRealOtp) {
      const authModalObserver = new MutationObserver(() => {
        const modal = document.getElementById("adminAccessModal");
        install();
        if (modal?.dataset.cicRealOtp === "true") {
          authModalObserver.disconnect();
          maybeOpenOwnerPrompt();
        }
      });
      authModalObserver.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener("pagehide", () => authModalObserver.disconnect(), { once: true });
    }
    window.openAdminAccess=async function(){
      // Do not invoke the legacy entry point: it can route an authenticated
      // owner into the newer dashboard instead of the original V18 Control Room.
      const showLogin=()=>{
        setOwnerNavVisible(false);
        if(typeof window.openModal==="function")window.openModal("adminAccessModal");
        else {const m=$("#adminAccessModal");if(m)m.style.display="";}
        const s=$("#cicOwnerAuthStatus");if(s)s.hidden=true;
      };
      const client=db();
      if(!client){showLogin();return;}
      try{
        const {data,error}=await client.auth.getSession();
        if(!error&&data&&data.session&&await isApprovedOwner(data.session.user)){
          setOwnerNavVisible(true);
          await openOriginalControlRoom();
          return;
        }
      }catch(_){}
      showLogin();
    };
    maybeOpenOwnerPrompt();
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
          const client=db();
          if(client){
            try{
              const {data}=await client.auth.getSession();
              if(data&&data.session&&await isApprovedOwner(data.session.user)){
                setOwnerNavVisible(true);
                openOriginalControlRoom();
                return;
              }
            }catch(_){}
          }
          maybeOpenOwnerPrompt();
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
          if(await isApprovedOwner(session.user)){try{sessionStorage.setItem("cicOwnerOtpVerified","1");localStorage.setItem("cicOwnerDeviceHint","1");}catch(_){}setOwnerNavVisible(true);}
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
              openOriginalControlRoom();
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
      // On a browser previously verified as the owner device, restore the
      // familiar Admin sign-in prompt on the home page when the session expired.
      // This is only a UI hint: every login and every admin action still requires
      // a fresh server-side approved-owner check.
      let ownerDevice=false;
      try{ownerDevice=localStorage.getItem("cicOwnerDeviceHint")==="1";}catch(_){}
      if(ownerDevice&&!hasAuthCallback&&!ownerAccessRequested){
        window.setTimeout(maybeOpenOwnerPrompt,700);
      }
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();