/* CRAVE ISLAND CEYLON — Owner-only Team & Permissions workspace */
(function () {
  "use strict";
  const db = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  const modules = [
    ["catalogue","Catalogue & Products"],["inventory","Stock & Inventory"],["orders","Orders & Customers"],
    ["dispatch","Dispatch & Delivery"],["media","Media & Social"],["accounts","Accounts & Payments"],
    ["star_club","Star Club & Rewards"],["certificates","QR & Certificates"],["reports","Reports"],
    ["tasks","Team Tasks"],["settings","Store Settings"]
  ];
  const actions = [["read","View"],["create","Add"],["update","Edit"],["delete","Delete"],["approve","Approve"],["export","Export"]];
  const roles = [["supervisor","Supervisor"],["staff","Staff"],["media","Media"],["accounts","Accounts"],["star_club","Star Club"]];
  const presets = {
    supervisor:{orders:["read","update"],inventory:["read","update"],dispatch:["read","update"],tasks:["read","create","update"],reports:["read"]},
    staff:{tasks:["read","update"]},
    media:{media:["read","create","update","delete","approve","export"]},
    accounts:{accounts:["read","create","update","approve","export"],orders:["read"]},
    star_club:{star_club:["read","create","update","approve"],reports:["read"]}
  };
  let members=[], selected=null, permissions={};

  function addStyles(){
    if(document.getElementById("cic-team-permissions-style"))return;
    const style=document.createElement("style");style.id="cic-team-permissions-style";
    style.textContent=`
      #cicTeamPermModal{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;background:rgba(15,12,9,.72);padding:12px;box-sizing:border-box}
      #cicTeamPermModal.open{display:flex}
      #cicTeamPermModal .cic-tp-panel{width:min(1040px,100%);max-height:94dvh;overflow:auto;background:var(--card,#fff);color:var(--text,#241b16);border:1px solid rgba(190,151,76,.5);border-radius:20px;box-shadow:0 24px 80px #0005;padding:20px;box-sizing:border-box}
      #cicTeamPermModal .cic-tp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:-20px;background:var(--card,#fff);padding:4px 0 14px;z-index:2;border-bottom:1px solid #b99a5b44}
      #cicTeamPermModal h2{font-size:22px;margin:0}#cicTeamPermModal p{font-size:13px;line-height:1.5;opacity:.8}
      #cicTeamPermModal button,#cicTeamPermModal input,#cicTeamPermModal select{font:inherit}
      #cicTeamPermModal button{border:1px solid #b58b45;border-radius:10px;padding:10px 14px;background:#f7edda;color:#2b1c12;font-weight:700;cursor:pointer}
      #cicTeamPermModal button.primary{background:#2d2118;color:#fff3d8}
      #cicTeamPermModal button:disabled{opacity:.45;cursor:not-allowed}
      #cicTeamPermModal input,#cicTeamPermModal select{width:100%;min-height:42px;border:1px solid #b99a5b88;border-radius:9px;padding:8px 10px;background:var(--input-bg,#fff);color:var(--text,#241b16);box-sizing:border-box}
      #cicTeamPermModal .cic-tp-grid{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;margin-top:16px}
      #cicTeamPermModal .cic-tp-box{border:1px solid #b99a5b55;border-radius:14px;padding:14px;min-width:0}
      #cicTeamPermModal .cic-tp-member{display:block;width:100%;text-align:left;margin:0 0 8px;background:transparent!important;color:inherit!important;border:1px solid #b99a5b55!important}
      #cicTeamPermModal .cic-tp-member.active{background:#efe0c3!important;border-color:#b58b45!important;color:#26180f!important}
      #cicTeamPermModal .cic-tp-member small{display:block;font-weight:400;opacity:.75;margin-top:3px}
      #cicTeamPermModal .cic-tp-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #cicTeamPermModal .cic-tp-field label{display:block;font-size:12px;font-weight:700;margin-bottom:5px}
      #cicTeamPermModal .cic-tp-perms{margin-top:16px;overflow:auto}
      #cicTeamPermModal table{width:100%;border-collapse:collapse;font-size:12px;min-width:570px}
      #cicTeamPermModal th,#cicTeamPermModal td{padding:9px 7px;border-bottom:1px solid #b99a5b33;text-align:center}
      #cicTeamPermModal th:first-child,#cicTeamPermModal td:first-child{text-align:left;min-width:145px}
      #cicTeamPermModal input[type=checkbox]{width:18px;height:18px;min-height:18px;accent-color:#94702d}
      #cicTeamPermModal .cic-tp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
      #cicTeamPermModal .cic-tp-status{margin-top:12px;padding:10px;border-radius:9px;background:#eee4d3;font-size:13px;white-space:pre-wrap}
      #cicTeamPermModal .cic-tp-invite{margin-top:18px;border-top:1px solid #b99a5b44;padding-top:16px}
      #cicTeamPermModal .cic-tp-owner{font-size:12px;opacity:.7}
      @media(max-width:680px){#cicTeamPermModal .cic-tp-panel{padding:14px;border-radius:14px}#cicTeamPermModal .cic-tp-grid{grid-template-columns:1fr}#cicTeamPermModal .cic-tp-members{display:grid;grid-template-columns:1fr 1fr;gap:7px}#cicTeamPermModal .cic-tp-member{margin:0;padding:9px 7px!important;font-size:12px}#cicTeamPermModal h2{font-size:18px}}
    `;
    document.head.appendChild(style);
  }
  function ensureModal(){
    if(document.getElementById("cicTeamPermModal"))return;
    const modal=document.createElement("div");modal.id="cicTeamPermModal";modal.setAttribute("aria-hidden","true");
    modal.innerHTML=`<section class="cic-tp-panel" role="dialog" aria-modal="true" aria-labelledby="cicTpTitle">
      <header class="cic-tp-head"><div><h2 id="cicTpTitle">Main Admin · Team & Permissions</h2><p style="margin:5px 0 0">Manage team access centrally. Changes are enforced by Supabase policies.</p></div><button type="button" data-close>Close ✕</button></header>
      <div class="cic-tp-grid">
        <aside class="cic-tp-box"><h3 style="margin:0 0 10px">Team members</h3><div class="cic-tp-members" id="cicTpMembers">Loading team…</div>
          <div class="cic-tp-invite"><h3 style="margin:0 0 10px">Invite a team member</h3>
            <div class="cic-tp-field"><label for="cicTpInviteName">Name</label><input id="cicTpInviteName" maxlength="100" placeholder="Team member name"></div>
            <div class="cic-tp-field" style="margin-top:8px"><label for="cicTpInviteEmail">Email address</label><input id="cicTpInviteEmail" type="email" autocomplete="email" placeholder="name@example.com"></div>
            <div class="cic-tp-field" style="margin-top:8px"><label for="cicTpInviteRole">Workspace role</label><select id="cicTpInviteRole">${roles.map(r=>`<option value="${r[0]}">${r[1]}</option>`).join("")}</select></div>
            <button class="primary" id="cicTpInviteBtn" type="button" style="width:100%;margin-top:10px">Send secure invitation</button><p style="font-size:11px;line-height:1.45;opacity:.75">The invitation is sent by Supabase Auth. The account remains pending until Main Admin approves its role and permissions.</p>
          </div>
        </aside>
        <main class="cic-tp-box"><div id="cicTpEditor"><p>Select a team member to manage their access.</p></div></main>
      </div><div id="cicTpStatus" class="cic-tp-status" role="status" aria-live="polite" hidden></div>
    </section>`;
    modal.addEventListener("click",e=>{if(e.target===modal||e.target.closest("[data-close]"))close();});
    document.body.appendChild(modal);
    document.getElementById("cicTpInviteBtn").addEventListener("click",invite);
  }
  function status(message,bad=false){const el=document.getElementById("cicTpStatus");if(!el)return;el.hidden=false;el.textContent=message;el.style.background=bad?"#f8deda":"#e9f1e7";}
  function close(){const m=document.getElementById("cicTeamPermModal");if(m){m.classList.remove("open");m.setAttribute("aria-hidden","true");}}
  function open(){ensureModal();const m=document.getElementById("cicTeamPermModal");m.classList.add("open");m.setAttribute("aria-hidden","false");loadMembers();}
  async function loadMembers(){
    const client=db();const host=document.getElementById("cicTpMembers");if(!client){host.textContent="Secure connection is not ready.";return;}
    host.textContent="Loading team…";
    const {data,error}=await client.rpc("owner_list_team_members");
    if(error){host.textContent="Could not load team. "+error.message;status("Team list failed to load. Check owner session and database access.",true);return;}
    members=data||[];
    if(!members.length){host.textContent="No team accounts yet. Invite your first team member below.";document.getElementById("cicTpEditor").innerHTML="<p>No team member selected.</p>";return;}
    host.innerHTML=members.map(m=>`<button type="button" class="cic-tp-member" data-id="${m.user_id}">${escapeHtml(m.display_name||m.email||"Team member")}<small>${escapeHtml(m.role)} · ${m.approved?"Active":"Pending approval"}</small></button>`).join("");
    host.querySelectorAll("[data-id]").forEach(b=>b.addEventListener("click",()=>selectMember(b.dataset.id)));
    selectMember(selected&&members.some(m=>m.user_id===selected)?selected:members[0].user_id);
  }
  function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function selectMember(id){
    selected=id;const member=members.find(m=>m.user_id===id);if(!member)return;
    document.querySelectorAll("#cicTpMembers [data-id]").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
    if(member.role==="owner"){document.getElementById("cicTpEditor").innerHTML=`<h3>${escapeHtml(member.display_name||"Main Admin")}</h3><p class="cic-tp-owner">Main Admin · Full access to all areas. Owner access cannot be edited or revoked here.</p>`;return;}
    permissions=JSON.parse(JSON.stringify(member.permissions||{}));
    const roleOptions=roles.map(r=>`<option value="${r[0]}" ${member.role===r[0]?"selected":""}>${r[1]}</option>`).join("");
    document.getElementById("cicTpEditor").innerHTML=`
      <div class="cic-tp-form">
        <div class="cic-tp-field"><label>Name</label><input value="${escapeHtml(member.display_name||"")}" disabled></div>
        <div class="cic-tp-field"><label>Email</label><input value="${escapeHtml(member.email||"")}" disabled></div>
        <div class="cic-tp-field"><label>Role / workspace</label><select id="cicTpRole">${roleOptions}</select></div>
        <div class="cic-tp-field"><label>Account status</label><select id="cicTpApproved"><option value="true" ${member.approved?"selected":""}>Approved — access enabled</option><option value="false" ${!member.approved?"selected":""}>Pending / Suspended — no access</option></select></div>
      </div>
      <div class="cic-tp-actions"><button type="button" id="cicTpPreset">Load role defaults</button><button type="button" id="cicTpClear">Clear all permissions</button></div>
      <div class="cic-tp-perms"><h3>Module permissions</h3><p>Tick only the actions this person is allowed to perform.</p>
      <table><thead><tr><th>Module</th>${actions.map(a=>`<th>${a[1]}</th>`).join("")}</tr></thead><tbody>
      ${modules.map(([key,label])=>`<tr><td>${label}</td>${actions.map(([act])=>`<td><input type="checkbox" data-module="${key}" data-action="${act}" ${(permissions[key]||[]).includes(act)?"checked":""}></td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
      <div class="cic-tp-actions"><button type="button" class="primary" id="cicTpSave">Save permissions</button></div>
    `;
    document.getElementById("cicTpPreset").onclick=()=>{permissions=JSON.parse(JSON.stringify(presets[document.getElementById("cicTpRole").value]||{}));refreshChecks();};
    document.getElementById("cicTpRole").onchange=()=>{permissions=JSON.parse(JSON.stringify(presets[document.getElementById("cicTpRole").value]||{}));refreshChecks();};
    document.getElementById("cicTpClear").onclick=()=>{permissions={};refreshChecks();};
    document.getElementById("cicTpSave").onclick=save;
    document.querySelectorAll("#cicTpEditor input[type=checkbox]").forEach(cb=>cb.addEventListener("change",()=>{
      const mod=cb.dataset.module,act=cb.dataset.action;permissions[mod]=permissions[mod]||[];
      permissions[mod]=permissions[mod].filter(x=>x!==act);if(cb.checked)permissions[mod].push(act);
      if(permissions[mod].some(x=>x!=="read")&&!permissions[mod].includes("read"))permissions[mod].push("read");
      if(act==="read"&&!cb.checked&&permissions[mod].length){permissions[mod]=[];document.querySelectorAll(`#cicTpEditor input[data-module="${mod}"]`).forEach(x=>{if(x.dataset.action!=="read")x.checked=false;});}
      if(!permissions[mod].length)delete permissions[mod];
    }));
  }
  function refreshChecks(){document.querySelectorAll("#cicTpEditor input[type=checkbox]").forEach(cb=>{cb.checked=(permissions[cb.dataset.module]||[]).includes(cb.dataset.action);});}
  async function save(){
    const member=members.find(m=>m.user_id===selected);if(!member||member.role==="owner")return;
    const client=db();const role=document.getElementById("cicTpRole").value;const approved=document.getElementById("cicTpApproved").value==="true";
    const button=document.getElementById("cicTpSave");button.disabled=true;button.textContent="Saving…";
    const {error}=await client.rpc("owner_set_team_member_access",{_user_id:selected,_role:role,_approved:approved,_permissions:permissions});
    button.disabled=false;button.textContent="Save permissions";
    if(error){status("Save failed: "+error.message,true);return;}
    status("Saved securely. Backend permissions are now updated.");
    await loadMembers();
  }
  async function invite(){
    const client=db();const email=document.getElementById("cicTpInviteEmail").value.trim();const display_name=document.getElementById("cicTpInviteName").value.trim();const role=document.getElementById("cicTpInviteRole").value;
    if(!email){status("Enter the team member's email address.",true);return;}
    const button=document.getElementById("cicTpInviteBtn");button.disabled=true;button.textContent="Sending invitation…";
    const {data,error}=await client.functions.invoke("owner-invite-team-member",{body:{email,display_name,role}});
    button.disabled=false;button.textContent="Send secure invitation";
    if(error||data?.error){status("Invitation failed: "+(data?.error||error.message),true);return;}
    status("Invitation sent to "+email+". The account is pending until the person accepts and the owner approves access.");
    document.getElementById("cicTpInviteEmail").value="";document.getElementById("cicTpInviteName").value="";
    await loadMembers();
  }
  function addEntry(){
    const modal=document.getElementById("controlRoomModal");if(!modal)return;
    const head=modal.querySelector(".sheet-head");if(!head)return;
    let btn=document.getElementById("cicTeamPermissionsEntry");
    if(!btn){btn=document.createElement("button");btn.id="cicTeamPermissionsEntry";btn.type="button";btn.textContent="Team & Permissions";btn.style.cssText="border:1px solid #c6a15d;border-radius:9px;padding:8px 10px;background:#f7edda;color:#2c1a14;font-weight:700;margin-right:8px;min-height:38px;white-space:nowrap";btn.addEventListener("click",open);const closeBtn=head.querySelector(".close");if(closeBtn)head.insertBefore(btn,closeBtn);else head.appendChild(btn);}
  }
  function boot(){
    addStyles();
    const observer=new MutationObserver(()=>{const modal=document.getElementById("controlRoomModal");if(modal&&(modal.classList.contains("open")||modal.style.display==="flex"))addEntry();});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]});
    addEntry();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();