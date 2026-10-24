/* CRAVE ISLAND CEYLON — real Supabase email OTP owner authentication.
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
  let ownerCompletion = false;
  async function completeOwnerLogin(user) {
    if (ownerCompletion || !user) return;
    ownerCompletion = true;
    try {
      if (!(await isApprovedOwner(user))) {
        await db().auth.signOut();
        status("This account is not marked as an approved CRAVE ISLAND CEYLON owner. Access was denied.", true);
        return;
      }
      status("Owner verified. Opening the live catalogue manager…");
      if (typeof window.closeModal === "function") window.closeModal("adminAccessModal");
      else { const m = $("#adminAccessModal"); if (m) m.style.display = "none"; }
      openLiveCatalogue();
    } finally {
      window.setTimeout(() => { ownerCompletion = false; }, 1000);
    }
  }
  function install() {
    const modal=$("#adminAccessModal"), email=$("#adminEmail"), otp=$("#adminOtp");
    const actions=modal&&$(".login-actions",modal);
    if(!modal||!email||!otp||!actions||modal.dataset.cicRealOtp==="true")return;
    modal.dataset.cicRealOtp="true";
    const authClient = db();
    if (authClient && !window.CIC_OWNER_AUTH_LISTENER_INSTALLED) {
      window.CIC_OWNER_AUTH_LISTENER_INSTALLED = true;
      authClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session && session.user) {
          window.setTimeout(() => { void completeOwnerLogin(session.user); }, 0);
        }
      });
      authClient.auth.getSession().then(({data}) => {
        if (data && data.session && data.session.user) void completeOwnerLogin(data.session.user);
      }).catch(() => {});
    }
    email.placeholder="Approved owner email";
    email.autocomplete="email";
    otp.type="text"; otp.inputMode="numeric"; otp.maxLength=6; otp.pattern="[0-9]{6}"; otp.autocomplete="one-time-code"; otp.placeholder="6-digit email code";
    const label=$('label[for="adminOtp"]',modal); if(label)label.textContent="Email verification code";
    const buttons=actions.querySelectorAll("button");
    if(buttons[0]){buttons[0].textContent="Send secure code";buttons[0].type="button";buttons[0].onclick=sendCode;}
    if(buttons[1]){buttons[1].textContent="Verify & open admin";buttons[1].type="button";buttons[1].onclick=verifyCode;}
    if(!$("#cicOwnerAuthStatus",modal)){
      const s=document.createElement("div");s.id="cicOwnerAuthStatus";s.hidden=true;s.setAttribute("role","status");s.setAttribute("aria-live","polite");actions.insertAdjacentElement("afterend",s);
    }
    const intro=$(".muted-note",modal);
    if(intro)intro.textContent="Use the existing approved owner email. Supabase sends a real sign-in code; the app verifies the code and checks the approved owner profile before opening live tools.";
    const note=$(".access-note",modal);
    if(note)note.textContent="This is real Supabase email OTP authentication. The old demo-only OTP path is disabled. Only an approved owner account can open live catalogue tools.";
    modal.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.target===email||e.target===otp)){e.preventDefault();e.target===email?sendCode():verifyCode();}});
  }
  async function sendCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the email address of the approved owner account.",true);
    const btn=$(".login-actions button");
    if(btn){btn.disabled=true;btn.textContent="Sending…";}
    try{
      const {error}=await client.auth.signInWithOtp({
        email,
        options:{
          shouldCreateUser:false,
          emailRedirectTo:"https://craveislandceylonv18supabaseintegra.vercel.app/"
        }
      });
      if(error)status("Supabase could not send the sign-in email: "+(error.message||"Please wait before trying again."),true);
      else status("Check your email inbox and spam folder. Open the new Sign in link to return to this live website. If you receive a 6-digit code instead, enter it below.");
    }catch(e){status("Could not request a code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Send secure code";}}
  }
  async function verifyCode() {
    const client=db(), email=($("#adminEmail")?.value||"").trim(), token=($("#adminOtp")?.value||"").trim();
    if(!client)return status("Supabase is still connecting. Please wait and try again.",true);
    if(!email||!email.includes("@"))return status("Enter the owner email used to request the code.",true);
    if(!/^\d{6}$/.test(token))return status("Enter the 6-digit code sent by Supabase.",true);
    const btn=$(".login-actions button:nth-child(2)");
    if(btn){btn.disabled=true;btn.textContent="Verifying…";}
    try{
      const {data,error}=await client.auth.verifyOtp({email,token,type:"email"});
      if(error||!data.user){status("The code could not be verified. Check it or request a fresh code.",true);return;}
      await completeOwnerLogin(data.user);
    }catch(e){status("Could not verify the code because of a connection error.",true);}
    finally{if(btn){btn.disabled=false;btn.textContent="Verify & open admin";}}
  }
  function openLiveCatalogue(){
    let tries=0;
    const attempt=()=>{
      const button=$("#cicOwnerCatalogueButton");
      if(button){button.hidden=false;button.click();return;}
      if(++tries<30)window.setTimeout(attempt,200);
      else status("You are signed in, but the catalogue manager did not finish loading. Reload the page and try again.",true);
    };
    window.setTimeout(attempt,150);
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
    window.verifyAdminOtpDemo=function(){status("Demo OTP login is disabled. Send and verify a real Supabase code instead.",true);};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();
})();
