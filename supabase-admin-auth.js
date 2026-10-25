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
    if(!$("#cic-owner-shortcut-style")){
      const st=document.createElement("style");st.id="cic-owner-shortcut-style";
      st.textContent="body.cic-owner-shortcuts-unified #cicOwnerCatalogueButton,body.cic-owner-shortcuts-unified #cicOwnerOrdersButton,body.cic-owner-shortcuts-unified #cicPassportButton{display:none!important}";
      document.head.appendChild(st);
    }
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
  function installUnifiedLiveTools(){
    const room=$("#controlRoomModal"), tabs=room&&$(".admin-tabs",room);
    if(!room||!tabs)return;
    document.body.classList.add("cic-owner-shortcuts-unified");
    if($("#cicLiveCatalogueTab",tabs))return;
    const entries=[
      ["cicLiveCatalogueTab","Live Catalogue","cicOwnerCatalogueButton"],
      ["cicLiveOrdersTab","Live Orders","cicOwnerOrdersButton"],
      ["cicLivePassportsTab","QR Passports","cicPassportButton"]
    ];
    entries.forEach(([id,label,target])=>{
      const b=document.createElement("button");b.type="button";b.id=id;b.textContent=label;
      b.setAttribute("aria-label",label+" management");
      b.addEventListener("click",()=>{
        const launcher=document.getElementById(target);
        if(launcher){launcher.click();return;}
        status(label+" is still loading. Please wait a moment and try again.",true);
      });
      tabs.appendChild(b);
    });
  }
  function openOwnerDashboard(){
    // Keep the original organized Control Room as the single owner entry point.
    const dashboard=$("#cicOwnerDashboard");
    if(dashboard)dashboard.remove();
    if(typeof window.closeModal==="function")window.closeModal("adminAccessModal");
    installUnifiedLiveTools();
    if(typeof window.roleOpen==="function"){
      window.roleOpen("overview");
      installUnifiedLiveTools();
      return;
    }
    if(typeof window.openModal==="function"&&document.getElementById("controlRoomModal")){
      window.openModal("controlRoomModal");
      installUnifiedLiveTools();
      status("Control Room opened. Use its tabs for live catalogue, orders and QR passports.");
      return;
    }
    status("Owner sign-in succeeded, but the original Control Room did not load. Refresh the page and try again.",true);
  }
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
        if(event==="SIGNED_OUT")document.body.classList.remove("cic-owner-shortcuts-unified");
        if(session&&session.user)window.setTimeout(async()=>{
          if(await isApprovedOwner(session.user)){
            installUnifiedLiveTools();
            document.body.classList.add("cic-owner-shortcuts-unified");
          }
        },250);
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
