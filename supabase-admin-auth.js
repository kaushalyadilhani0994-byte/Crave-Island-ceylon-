/* CRAVE ISLAND CEYLON — real Supabase email link/code owner authentication.
 * No browser-only demo code grants access. Database RLS remains authoritative.
 */
(function () {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  function status(message, bad=false) {
    const el=$("#cicOwnerAuthStatus");
    if(!el)return;
    el.textContent=message;
    el.hidden=false;
    el.style.cssText="margin-top:10px;padding:10px 12px;border-radius:9px;background:"+(bad?"#f8deda":"#f0e5d4")+";color:#2C1A14;font-size:12px;line-height:1.5";
  }
  async function isApprovedOwner(user) {
    const client=db(); if(!client||!user)return false;
    const {data,error}=await client.from("staff_profiles").select("role,approved").eq("id",user.id).maybeSingle();
    return !error&&!!data&&data.role==="owner"&&data.approved===true;
  }
  function install() {
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
    // Hide the old browser-only role selector, local invitation preview, and demo warnings.
    modal.querySelectorAll(".role-grid-v9,.role-workspace,#roleWorkspace,.permission-list,#permissionList,.invite-box,.demo-warning")
      .forEach(el=>{el.style.display="none";});
    email.placeholder="Approved owner email";
    email.autocomplete="email";
    otp.type="text"; otp.inputMode="numeric"; otp.maxLength=6; otp.pattern="[0-9]{6}"; otp.autocomplete="one-time-code"; otp.placeholder="6-digit code (if provided)";
    const label=$('label[for="adminOtp"]',modal); if(label)label.textContent="One-time code (if the email includes one)";
    const buttons=actions.querySelectorAll("button");
    if(buttons[0]){buttons[0].textContent="Send sign-in email";buttons[0].type="button";buttons[0].onclick=sendCode;}
    if(buttons[1]){buttons[1].textContent="Verify code / open admin";buttons[1].type="button";buttons[1].onclick=verifyCode;}
    if(!$("#cicOwnerAuthStatus",modal)){
      const s=document.createElement("div");s.id="cicOwnerAuthStatus";s.hidden=true;s.setAttribute("role","status");s.setAttribute("aria-live","polite");actions.insertAdjacentElement("afterend",s);
    }
    const intro=$(".muted-note",modal);
    if(intro)intro.textContent="Use the approved owner email. Depending on the Supabase email template, you may receive a sign-in link or a 6-digit code. Open any link in this same browser, or enter the code below; only an approved owner can open live tools.";
    const note=$(".access-note",modal);
    if(note)note.textContent="This uses real Supabase email authentication. This project may send a sign-in link instead of a numeric code. Only an approved owner account can open live catalogue tools.";
    modal.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target===email||e.target===otp)){e.preventDefault();e.target===email?sendCode():verifyCode();}});
  }
  async function sendCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the email address of the approved owner account.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
      if(error)status("Could not send a sign-in code. Check the email address and Supabase Auth email configuration, then try again.",true);
      else { try{localStorage.setItem("cicOwnerSignInPending","1");}catch(_){} status("Supabase sent a sign-in email. If it contains a link, open it in this same browser; if it contains a 6-digit code, enter it below. Check spam too."); }
    }catch(e){status("Could not request a code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Send sign-in email";}}
  }
  async function verifyCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim(), token=($("#adminOtp")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the owner email used to request the code.",true);
    if(!/^\d{6}$/.test(token))return status("If your email contains a sign-in link rather than a 6-digit code, open that link in this same browser. The approved-owner check will then open the live tools automatically.",true);
    const btn=$(".login-actions button:nth-child(2)");
    if(btn){btn.disabled=true;btn.textContent="Verifying…";}
    try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
    try{
      const {data,error}=await client.auth.verifyOtp({email,token,type:"email"});
      if(error||!data.user){status("The code could not be verified. Check it or request a fresh sign-in email.",true);return;}
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      if(!(await isApprovedOwner(data.user))){
        await client.auth.signOut();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
      status("Owner verified. Opening the live catalogue manager…");
      if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
      else {const m=$("#adminAccessModal");if(m)m.style.display="none";}
      openOwnerDashboard();
    }catch(e){status("Could not verify the code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Verify code / open admin";}}
  }
  function openOwnerDashboard(){
    let dashboard=$("#cicOwnerDashboard");
    if(!dashboard){
      const style=document.createElement("style");
      style.id="cicOwnerDashboardStyle";
      style.textContent=`
        #cicOwnerDashboard{position:fixed;inset:0;z-index:10001;background:#f6f1ea;color:#2c1a14;overflow:auto;padding:clamp(14px,4vw,28px);font-family:system-ui,-apple-system,Segoe UI,sans-serif}
        #cicOwnerDashboard .cic-dash-wrap{max-width:760px;margin:0 auto}
        #cicOwnerDashboard .cic-dash-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:1px solid #e4d7c7;padding-bottom:16px;margin-bottom:18px}
        #cicOwnerDashboard h1{font:400 clamp(27px,6vw,38px)/1.12 Georgia,serif;margin:0 0 7px}
        #cicOwnerDashboard p{color:#76665b;line-height:1.5;margin:0}
        #cicOwnerDashboard .cic-dash-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        #cicOwnerDashboard .cic-dash-card{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:8px;min-height:128px;padding:18px;border:1px solid #e2d5c4;border-radius:15px;background:#fffaf3;color:#2c1a14}
        #cicOwnerDashboard .cic-dash-card strong{font:400 22px Georgia,serif}
        #cicOwnerDashboard .cic-dash-card span{font-size:13px;color:#76665b;line-height:1.45}
        #cicOwnerDashboard .cic-dash-card:active{transform:scale(.99)}
        #cicOwnerDashboard .cic-dash-action{border:1px solid #d4af37;border-radius:10px;padding:10px 13px;background:#2c1a14;color:#fff8e7;font-weight:650}
        #cicOwnerDashboard .cic-dash-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap}
        @media(max-width:430px){#cicOwnerDashboard .cic-dash-grid{grid-template-columns:1fr}#cicOwnerDashboard .cic-dash-card{min-height:98px}}
      `;
      document.head.appendChild(style);
      dashboard=document.createElement("div");
      dashboard.id="cicOwnerDashboard";
      dashboard.setAttribute("role","dialog");
      dashboard.setAttribute("aria-modal","true");
      dashboard.setAttribute("aria-label","CRAVE ISLAND CEYLON owner dashboard");
      dashboard.innerHTML=`
        <div class="cic-dash-wrap">
          <header class="cic-dash-top"><div><h1>CRAVE ISLAND CEYLON</h1><p>Owner workspace · Manage your business from one place.</p></div><button class="cic-dash-action" type="button" id="cicDashSignOut">Sign out</button></header>
          <div class="cic-dash-grid">
            <button class="cic-dash-card" type="button" data-open="cicOwnerCatalogueButton"><strong>Products & Catalogue</strong><span>Add and update products, prices, ingredients, images and availability.</span></button>
            <button class="cic-dash-card" type="button" data-open="cicOwnerOrdersButton"><strong>Customer Orders</strong><span>Review incoming orders and update their progress.</span></button>
            <button class="cic-dash-card" type="button" data-open="cicPassportButton"><strong>QR Product Passports</strong><span>Manage product traceability and passport details.</span></button>
            <button class="cic-dash-card" type="button" data-open="storefront"><strong>Open Storefront</strong><span>Return to the customer-facing CRAVE ISLAND CEYLON shop.</span></button>
          </div>
          <div class="cic-dash-footer"><p>Owner access is checked against your approved account.</p><button class="cic-dash-action" type="button" id="cicDashClose">Back to shop</button></div>
        </div>`;
      document.body.appendChild(dashboard);
      dashboard.addEventListener("click",async e=>{
        const card=e.target.closest("[data-open]");
        if(card){
          const target=card.getAttribute("data-open");
          if(target==="storefront"){dashboard.remove();return;}
          let tries=0;
          const launch=()=>{
            const b=document.getElementById(target);
            if(b){b.hidden=false;b.click();return;}
            if(++tries<25){setTimeout(launch,200);return;}
            status("This section is still loading. Please try again in a moment.",true);
          };
          launch();
        }
      });
      $("#cicDashClose").onclick=()=>dashboard.remove();
      $("#cicDashSignOut").onclick=async()=>{
        const client=db();
        if(client)await client.auth.signOut();
        dashboard.remove();
        try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
        status("You have signed out.");
        if(typeof window.openAdminAccess==="function")window.openAdminAccess();
      };
    }
    dashboard.style.display="block";
    dashboard.scrollTop=0;
  }
  let handlingPendingOwnerSession=false;
  async function handlePendingOwnerSession(session){
    let pending=false;
    try{pending=localStorage.getItem("cicOwnerSignInPending")==="1";}catch(_){}
    if(!pending||!session||!session.user||handlingPendingOwnerSession)return;
    handlingPendingOwnerSession=true;
    try{
      if(!(await isApprovedOwner(session.user))){
        try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
        await db().auth.signOut();
        if(typeof window.openAdminAccess==="function")window.openAdminAccess();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.",true);
        return;
      }
      try{localStorage.removeItem("cicOwnerSignInPending");}catch(_){}
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
      if(typeof original==="function")original.apply(this,arguments);
      const s=$("#cicOwnerAuthStatus");if(s)s.hidden=true;
      const email=$("#adminEmail");if(email)email.focus({preventScroll:true});
    };
    window.requestAdminOtp=sendCode;
    window.verifyAdminOtpDemo=function(){status("Demo OTP login is disabled. Use the real Supabase sign-in email instead.",true);};
    const client=db();
    if(client){
      client.auth.onAuthStateChange((event,session)=>{
        if(event==="SIGNED_IN"&&session)window.setTimeout(()=>handlePendingOwnerSession(session),0);
      });
      window.setTimeout(async()=>{
        let pending=false;
        try{pending=localStorage.getItem("cicOwnerSignInPending")==="1";}catch(_){}
        if(!pending)return;
        try{const {data:{session}}=await client.auth.getSession();if(session)await handlePendingOwnerSession(session);}catch(_){}
      },600);
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();
