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
    const bottom = document.querySelector(".bottom");
    // The current storefront can lack an Admin nav item entirely. Create it
    // only after the server-side approved-owner check succeeds.
    let adminButton = bottom && (
      bottom.querySelector("#cicOwnerAdminNavEntry") ||
      bottom.querySelector('[onclick*="openAdminAccess"]') ||
      Array.from(bottom.querySelectorAll(".nav")).find(el =>
        /(^|\\s)Admin(\\s|$)/i.test((el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim())
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
        const count = Math.max(1, bottom.querySelectorAll(".nav").length);
        bottom.style.setProperty("grid-template-columns", "repeat(" + count + ",minmax(0,1fr))", "important");
      }
      if (adminButton) adminButton.style.setProperty("display", "flex", "important");
      syncOwnerAdminShortcut(true);
    } else {
      document.body.classList.remove("cic-owner-shortcuts-unified");
      if (bottom) bottom.style.removeProperty("grid-template-columns");
      // Dynamically created Admin entry is removed at sign-out. Customers
      // therefore never see an Admin shortcut or owner workspace.
      const privateEntry = document.getElementById("cicOwnerAdminNavEntry");
      if (privateEntry) privateEntry.remove();
      if (adminButton && adminButton.id !== "cicOwnerAdminNavEntry") adminButton.style.setProperty("display", "none", "important");
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
    if(!isOwnerEmail(email))return status("This email is not on the owner's allowed email list.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:window.location.origin+window.location.pathname}});
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
    // Keep the original V18 Control Room clean; do not inject a second owner-tools card hub.
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
          #cicOwnerDashboard .cic-dash-action{border:1px solid #d4af37;border-radius:10px;padding:10px 13px;background:#2c1a14;color:#fff8e7;font-weight:650;touch-action:manipulation}
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
          </div>
          <p class="cic-dash-note">This workspace is visible only after the approved owner account is verified. Customers do not receive these owner tools.</p></section>
          <div class="cic-dash-footer"><p>Verified owner access · CRAVE ISLAND CEYLON</p><button class="cic-dash-action" type="button" id="cicDashClose">Back to shop</button></div>
        </div>`;
      document.body.appendChild(dashboard);
      // Make the phone/browser Back action close the owner dashboard instead of leaving the app.
      try{history.pushState({cicOwnerDashboard:true},'','#owner-admin');}catch(_){}
      dashboard.addEventListener("click",async e=>{
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
  }
  window.addEventListener("popstate",function(event){
    const dashboard=document.getElementById("cicOwnerDashboard");
    if(!dashboard)return;
    if(event.state&&event.state.cicOwnerDashboard){
      // Back from a Control Room/tool panel: close the active work modal and return to Admin, not Home.
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
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      setOwnerNavVisible(true);
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const modal=$("#adminAccessModal");if(modal)modal.style.display="none";}
      openOwnerDashboard();
    }catch(_){status("Could not verify the owner session. Please reopen Admin and try again.",true);}
    finally{handlingPendingOwnerSession=false;}
  }
  async function wire(){
    // Hide the customer-facing Admin nav immediately on startup, before any
    // persisted session or auth-state callback is processed.
    setOwnerNavVisible(false);
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
    const client=db();
    if(client){
      client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_OUT"){setOwnerNavVisible(false);try{sessionStorage.removeItem("cicOwnerOtpVerified");}catch(_){}}
        if(session&&session.user)window.setTimeout(async()=>{
          let otpVerified=false;try{otpVerified=sessionStorage.getItem("cicOwnerOtpVerified")==="1";}catch(_){}
          if(await isApprovedOwner(session.user)){try{sessionStorage.setItem("cicOwnerOtpVerified","1");}catch(_){}setOwnerNavVisible(true);}
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