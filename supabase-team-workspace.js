/* CRAVE ISLAND CEYLON — approved team workspace */
(function(){
"use strict";
window.openApprovedTeamWorkspace=function(profile){
  const labels={catalogue:"Catalogue & Products",inventory:"Stock & Inventory",orders:"Orders & Customers",dispatch:"Dispatch & Delivery",media:"Media & Social",accounts:"Accounts & Payments",star_club:"Star Club & Rewards",certificates:"QR & Certificates",reports:"Reports",tasks:"Team Tasks",settings:"Store Settings"};
  const actions={read:"View",create:"Add",update:"Edit",delete:"Delete",approve:"Approve",export:"Export"};
  let root=document.getElementById("cicStaffWorkspace");
  if(!root){root=document.createElement("div");root.id="cicStaffWorkspace";root.style.cssText="position:fixed;inset:0;z-index:100060;background:#f6f0e5;color:#2b2118;overflow:auto;padding:clamp(14px,4vw,30px);box-sizing:border-box";document.body.appendChild(root);}
  const safe=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const entries=Object.entries(profile.permissions||{}).filter(([k,v])=>labels[k]&&Array.isArray(v)&&v.length);
  root.innerHTML='<div style="max-width:900px;margin:auto"><header style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #b99a5b;padding-bottom:14px"><div><small style="letter-spacing:2px;color:#9b7537">CRAVE ISLAND CEYLON</small><h1 style="font:400 clamp(25px,5vw,36px) Georgia,serif;margin:5px 0">My Work Space</h1><div>'+safe(profile.display_name||profile.email)+' · '+safe(profile.role).replace(/_/g," ")+'</div></div><button id="cicStaffSignOut" style="border:1px solid #b99a5b;border-radius:9px;padding:10px 13px;background:#fff8e7;color:#2b2118;font-weight:700">Sign out</button></header><h2 style="font:400 22px Georgia,serif;margin-top:24px">Your assigned areas</h2><p style="font-size:13px;line-height:1.5">Only the modules and actions assigned by Main Admin are shown here. Database policies independently enforce access.</p><div id="cicStaffModules" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px"></div><p style="font-size:12px;opacity:.7;margin-top:20px">If you need another area or action, contact Main Admin.</p></div>';
  const grid=root.querySelector("#cicStaffModules");
  grid.innerHTML=entries.length?entries.map(([k,v])=>'<article style="padding:16px;border:1px solid #b99a5b;border-radius:14px;background:white"><h3 style="margin:0 0 9px;font:400 19px Georgia,serif">'+labels[k]+'</h3><div style="display:flex;flex-wrap:wrap;gap:6px">'+v.filter(x=>actions[x]).map(x=>'<span style="font-size:11px;border-radius:20px;padding:5px 9px;background:#eee2c9;color:#4c3518">'+actions[x]+'</span>').join("")+'</div></article>').join(""):'<article style="padding:18px;border:1px solid #b99a5b;border-radius:12px;background:white">No modules have been assigned yet. Please contact Main Admin.</article>';
  const db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
  const canOrdersRead=(profile.permissions?.orders||[]).includes("read");
  const canDispatchRead=(profile.permissions?.dispatch||[]).includes("read");
  const canOrdersUpdate=(profile.permissions?.orders||[]).includes("update");
  const canDispatchUpdate=(profile.permissions?.dispatch||[]).includes("update");
  if(db&&(canOrdersRead||canDispatchRead)){
    const section=document.createElement("section");
    section.style.cssText="margin-top:18px;padding:16px;border:1px solid #b99a5b;border-radius:14px;background:#fff";
    section.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="font:400 22px Georgia,serif;margin:0">Live Orders & Dispatch</h2><p style="font-size:12px;color:#6b5a4e;margin:5px 0 0">Only assigned order details and permitted status actions appear here.</p></div><button id="cicTeamOrdersRefresh" style="border:1px solid #b99a5b;border-radius:8px;padding:9px 12px;background:#fff8e7;color:#2b2118;font-weight:700">Refresh</button></div><div id="cicTeamOrdersList" style="margin-top:12px" aria-live="polite">Loading assigned orders…</div>';
    root.querySelector("#cicStaffModules").insertAdjacentElement("afterend",section);
    const list=section.querySelector("#cicTeamOrdersList");
    const escText=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const transitions={pending:["confirmed","cancelled"],confirmed:["processing","cancelled"],processing:["shipped","cancelled"],shipped:["delivered"],delivered:[],cancelled:[]};
    const refreshTeamOrders=async()=>{
      list.textContent="Loading assigned orders…";
      const columns=canOrdersRead
        ?"id,order_number,customer_name,phone,shipping_address,total,currency,payment_method,payment_status,order_status,created_at"
        :"id,order_number,phone,shipping_address,order_status,created_at";
      const {data,error}=await db.from("store_orders").select(columns).order("created_at",{ascending:false}).limit(50);
      if(error){list.textContent="Orders could not be loaded. Your assigned read permission and database access were checked; contact Main Admin if this continues.";return;}
      if(!data||!data.length){list.textContent="No customer orders are available yet.";return;}
      list.innerHTML=data.map(o=>{
        const status=String(o.order_status||"pending").toLowerCase();
        const allowed=canOrdersUpdate?(transitions[status]||[]):canDispatchUpdate?(status==="processing"?["shipped"]:status==="shipped"?["delivered"]:[]):[];
        const address=o.shipping_address&&typeof o.shipping_address==="object"?Object.values(o.shipping_address).filter(Boolean).join(", "):String(o.shipping_address||"");
        const customer=canOrdersRead?'<div style="font-size:12px;margin-top:5px">'+escText(o.customer_name||"Customer")+' · '+escText(o.phone||"No phone")+'</div>':'<div style="font-size:12px;margin-top:5px">Dispatch contact: '+escText(o.phone||"Not supplied")+'</div>';
        const details=canOrdersRead?'<div style="font-size:12px;margin-top:5px">Total: '+escText(o.currency||"LKR")+' '+Number(o.total||0).toLocaleString("en-LK")+' · '+escText(o.payment_method||"")+' / '+escText(o.payment_status||"")+'</div>':"";
        const addressLine=canDispatchRead&&address?'<div style="font-size:12px;margin-top:5px;color:#66564d">'+escText(address)+'</div>':"";
        const controls=allowed.length?'<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:10px"><select data-team-order="'+escText(o.id)+'" style="padding:8px;border:1px solid #c9b99f;border-radius:8px">'+allowed.map(x=>'<option value="'+x+'">'+x.charAt(0).toUpperCase()+x.slice(1)+'</option>').join("")+'</select><button data-team-save="'+escText(o.id)+'" style="border:1px solid #b99a5b;border-radius:8px;padding:8px 11px;background:#2b2118;color:white;font-weight:700">Save status</button></div>':"";
        return '<article style="padding:12px;margin:9px 0;border:1px solid #e5dac8;border-radius:11px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>'+escText(o.order_number||"Order")+'</b><b>'+escText(status)+'</b></div>'+customer+addressLine+details+controls+'</article>';
      }).join("");
      list.querySelectorAll("[data-team-save]").forEach(button=>button.addEventListener("click",async()=>{
        const id=button.getAttribute("data-team-save"),select=list.querySelector('[data-team-order="'+id+'"]'),nextStatus=select?.value;
        if(!nextStatus||!window.confirm("Update this order to "+nextStatus+"?"))return;
        button.disabled=true;button.textContent="Saving…";
        const {data,error}=await db.functions.invoke("update-order-status",{body:{order_id:id,order_status:nextStatus}});
        if(error||!data||data.error){window.alert(data?.error||"Status update failed. Refresh and try again.");button.disabled=false;button.textContent="Save status";return;}
        await refreshTeamOrders();
      }));
    };
    section.querySelector("#cicTeamOrdersRefresh").onclick=refreshTeamOrders;
    refreshTeamOrders();
  }
  root.querySelector("#cicStaffSignOut").onclick=async()=>{const client=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;if(client)await client.auth.signOut();root.remove();};
};
})();