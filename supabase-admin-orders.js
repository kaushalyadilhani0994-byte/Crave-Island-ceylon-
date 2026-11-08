/* CRAVE ISLAND CEYLON — live owner order management */
(function () {
  "use strict";
  const client = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  // Keep owner tools inside the Admin workspace; never cover the storefront hero.
  const homeLayoutFix=document.createElement("style");
  homeLayoutFix.id="cic-owner-tools-home-layout-fix";
  homeLayoutFix.textContent="#cicOwnerOrdersButton,#cicTeamInventoryButton{display:none!important;visibility:hidden!important;pointer-events:none!important}\n.bottom{display:grid!important;grid-template-columns:repeat(7,minmax(0,1fr))!important;grid-auto-flow:row!important;align-items:stretch!important;gap:2px!important;width:min(620px,calc(100% - 14px))!important;box-sizing:border-box!important}\n.bottom>.nav{display:grid!important;grid-column:auto!important;min-width:0!important;width:100%!important;max-width:100%!important;padding:6px 1px 5px!important;white-space:nowrap!important;overflow:hidden!important;justify-items:center!important;align-content:center!important}\n.bottom>.nav .nav-label{font-size:clamp(7px,2vw,9px)!important;white-space:nowrap!important;letter-spacing:-.35px!important}\n.bottom>.nav .nav-sub{font-size:clamp(5px,1.55vw,7px)!important;white-space:nowrap!important}\n@media(max-width:520px){.bottom{grid-template-columns:repeat(7,minmax(0,1fr))!important}.bottom>.nav{padding-left:0!important;padding-right:0!important}}";
  document.head.appendChild(homeLayoutFix);

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (v) => "LKR " + Number(v || 0).toLocaleString("en-LK", {maximumFractionDigits:2});
  const next = {pending:["confirmed","cancelled"],confirmed:["processing","cancelled"],processing:["shipped","cancelled"],shipped:["delivered"],delivered:[],cancelled:[]};
  async function access() {
    const db=client(); if(!db) return {error:"Supabase connection is not ready."};
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session||session.user?.is_anonymous) return {error:"Please sign in with an approved CRAVE team account."};
    const {data:staff,error:se}=await db.from("staff_profiles").select("role,approved,permissions").eq("id",session.user.id).maybeSingle();
    if(se||!staff||staff.approved!==true) return {error:"This section is only available to an approved CRAVE team account."};
    const permissions=staff.permissions&&typeof staff.permissions==="object"?staff.permissions:{};
    const isOwner=staff.role==="owner";
    const canOrders=Array.isArray(permissions.orders)&&permissions.orders.includes("read");
    const canDispatch=Array.isArray(permissions.dispatch)&&permissions.dispatch.includes("read");
    if(!isOwner&&!canOrders&&!canDispatch) return {error:"Your account does not have permission to view orders."};
    return {db,isOwner,canOrdersUpdate:isOwner||(Array.isArray(permissions.orders)&&permissions.orders.includes("update")),canDispatchUpdate:!isOwner&&Array.isArray(permissions.dispatch)&&permissions.dispatch.includes("update")};
  }
  function notice(el,msg){ if(el) el.innerHTML='<div class="admin-note">'+esc(msg)+'</div>'; }
  async function refresh() {
    const el=document.getElementById("adminOrderTable"); if(!el)return;
    notice(el,"Loading live orders from Supabase…");
    const a=await access(); if(a.error){notice(el,a.error);return;}
    let deliveredAtAvailable=true;
    let ordersResult=await a.db.from("store_orders").select("id,order_number,customer_name,email,phone,shipping_address,subtotal,delivery_fee,total,currency,payment_method,payment_status,order_status,customer_note,created_at,delivered_at").order("created_at",{ascending:false}).limit(100);
    if(ordersResult.error && (ordersResult.error.code==="42703" || ordersResult.error.code==="PGRST204" || /delivered_at.*(does not exist|schema cache)|column.*delivered_at/i.test([ordersResult.error.message,ordersResult.error.details].filter(Boolean).join(" ")))){
      // Keep live orders usable while the separately reviewed delivered_at migration is still staged.
      deliveredAtAvailable=false;
      ordersResult=await a.db.from("store_orders").select("id,order_number,customer_name,email,phone,shipping_address,subtotal,delivery_fee,total,currency,payment_method,payment_status,order_status,customer_note,created_at").order("created_at",{ascending:false}).limit(100);
    }
    const {data:orders,error}=ordersResult;
    if(error){notice(el,"Could not load live orders. Check the owner access policy and try again.");return;}
    if(!orders||!orders.length){notice(el,"No real customer orders yet. New successful checkouts will appear here.");return;}
    const {data:items,error:itemError}=await a.db.from("store_order_items").select("order_id,product_name,quantity,unit_price,line_total").in("order_id",orders.map(o=>o.id));
    if(itemError){notice(el,"Orders loaded, but item details could not be retrieved.");return;}
    const byOrder={}; (items||[]).forEach(i=>(byOrder[i.order_id]||(byOrder[i.order_id]=[])).push(i));
    const migrationNotice=deliveredAtAvailable?"":'<div class="admin-note" style="margin-bottom:10px">Delivery timestamps are awaiting the approved database migration. Orders remain available; delivered-at history will appear after that migration is released.</div>';
    el.innerHTML=migrationNotice+orders.map(o=>{
      const st=String(o.order_status||"pending").toLowerCase();
      const allowedNext=a.isOwner||a.canOrdersUpdate?(next[st]||[]):a.canDispatchUpdate?(st==="processing"?["shipped"]:st==="shipped"?["delivered"]:[]):[];
      const options=allowedNext.map(n=>'<option value="'+n+'">'+n.replace(/^./,c=>c.toUpperCase())+'</option>').join("");
      const addr=o.shipping_address&&typeof o.shipping_address==="object"?Object.values(o.shipping_address).filter(Boolean).join(", "):String(o.shipping_address||"");
      const lines=(byOrder[o.id]||[]).map(i=>esc(i.product_name)+" × "+Number(i.quantity)+" ("+money(i.line_total)+")").join("<br>")||"Item details unavailable";
      return '<article class="table-row" style="display:block;padding:14px;margin:10px 0;border:1px solid #e6dccb;border-radius:12px">'+
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between"><b>'+esc(o.order_number||o.id)+'</b><b>'+money(o.total)+'</b></div>'+
        '<div style="margin-top:7px">'+esc(o.customer_name)+' · '+esc(o.phone||"No phone")+' · '+esc(o.email||"No email")+'</div>'+
        '<div style="margin-top:5px;color:#75645a;font-size:12px">'+esc(addr)+'</div>'+
        '<div style="margin-top:9px;font-size:13px">'+lines+'</div>'+
        '<div style="margin-top:9px;font-size:12px">Payment: '+esc(o.payment_method)+' / '+esc(o.payment_status)+' · Status: <b>'+esc(st)+'</b></div>'+
        (o.delivered_at?'<div style="margin-top:5px;font-size:11px;color:#75645a">Delivered: '+esc(new Date(o.delivered_at).toLocaleString("en-LK",{timeZone:"Asia/Colombo"}))+'</div>':"")+
        (o.customer_note?'<div style="margin-top:5px;font-size:12px">Note: '+esc(o.customer_note)+'</div>':"")+
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px" '+(!options.length?'hidden':'')+'><label style="font-size:12px">Update status</label><select data-cic-order-status="'+esc(o.id)+'" '+(!options.length?'disabled':'')+' style="max-width:190px;padding:8px;border-radius:8px;border:1px solid #d4c6b5">'+(options||'<option>No further changes</option>')+'</select><button class="secondary-btn" data-cic-save-order="'+esc(o.id)+'" '+(!options.length?'disabled':'')+'>Save status</button></div></article>';
    }).join("");
    el.querySelectorAll("[data-cic-save-order]").forEach(btn=>btn.addEventListener("click",async()=>{
      const id=btn.getAttribute("data-cic-save-order"),select=el.querySelector('[data-cic-order-status="'+id+'"]'),status=select&&select.value;
      if(!status||!window.confirm("Change this order status to "+status+"?"))return;
      btn.disabled=true;btn.textContent="Saving…";
      const {data,error}=await a.db.functions.invoke("update-order-status",{body:{order_id:id,order_status:status}});
      if(error||!data||data.error){window.alert((data&&data.error)||"Status update failed. Please refresh and try again.");btn.disabled=false;btn.textContent="Save status";return;}
      await refresh();
    }));
  }
  function mountOrdersUI() {
    if (document.getElementById("cicOwnerOrdersButton")) return;
    const style=document.createElement("style");
    style.textContent=`
      #cicOwnerOrdersButton{position:fixed;right:14px;bottom:170px;z-index:9998;background:#2C1A14;color:#FFF8E7;border:1px solid #D4AF37;border-radius:999px;padding:11px 15px;font:600 12px system-ui;box-shadow:0 5px 22px #2C1A1433}
      #cicOwnerOrdersModal{display:none;position:fixed;inset:0;z-index:10000;background:#1c110ed9;overflow:auto;padding:12px;align-items:flex-start;justify-content:center}
      #cicOwnerOrdersModal .cic-orders-panel{box-sizing:border-box;background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;border-radius:16px;width:min(980px,100%);margin:auto;padding:18px;font:14px system-ui;box-shadow:0 18px 55px #0005}
      #cicOwnerOrdersModal .cic-orders-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}
      #cicOwnerOrdersModal .cic-orders-head h2{font:normal 25px Georgia,serif;margin:0}
      #cicOwnerOrdersModal .cic-orders-muted{font-size:12px;color:#77665b;margin-top:5px}
      #cicOwnerOrdersModal button{border:1px solid #D4AF37;border-radius:8px;padding:9px 12px;background:#2C1A14;color:#FFF8E7;font-weight:650;cursor:pointer}
      #cicOwnerOrdersModal #adminOrderTable{margin-top:14px}
      #cicOwnerOrdersModal .admin-note{padding:12px;background:#f0e5d4;border-radius:8px;color:#2C1A14}
      @media(max-width:600px){#cicOwnerOrdersButton{bottom:170px;right:10px}#cicOwnerOrdersModal{padding:5px}#cicOwnerOrdersModal .cic-orders-panel{padding:12px}}
    `;
    document.head.appendChild(style);
    const button=document.createElement("button");
    button.id="cicOwnerOrdersButton";button.type="button";button.textContent="Orders & Fulfilment";button.hidden=true;
    button.addEventListener("click",()=>{const modal=document.getElementById("cicOwnerOrdersModal");if(modal){modal.style.display="flex";refresh();}});
    document.body.appendChild(button);
    const modal=document.createElement("div");
    modal.id="cicOwnerOrdersModal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label","Live order management");
    modal.innerHTML='<section class="cic-orders-panel"><div class="cic-orders-head"><div><h2>CRAVE ISLAND CEYLON · Orders</h2><div class="cic-orders-muted">Live customer orders · status updates are verified by the secure server function.</div></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button type="button" id="cicOwnerOrdersRefresh">Refresh</button><button type="button" id="cicOwnerOrdersClose">Close ✕</button></div></div><div id="adminOrderTable" aria-live="polite"></div></section>';
    modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none";});
    document.body.appendChild(modal);
    document.getElementById("cicOwnerOrdersClose").addEventListener("click",()=>{modal.style.display="none";});
    document.getElementById("cicOwnerOrdersRefresh").addEventListener("click",refresh);
    const update=async()=>{
      const db=client();let permitted=false;
      try{
        if(db){const {data:{session},error}=await db.auth.getSession();if(session&&!error&&!session.user?.is_anonymous){const {data,error:profileError}=await db.from("staff_profiles").select("role,approved,permissions").eq("id",session.user.id).maybeSingle();const p=data?.permissions&&typeof data.permissions==="object"?data.permissions:{};permitted=!profileError&&!!data&&data.approved===true&&(data.role==="owner"||["orders","dispatch"].some(k=>Array.isArray(p[k])&&p[k].includes("read")));}}
      }catch(_){}
      button.hidden=!permitted;
      if(!permitted)modal.style.display="none";
    };
    update();
    const db=client();if(db)db.auth.onAuthStateChange(()=>window.setTimeout(update,120));
  }
  mountOrdersUI();
  window.adminRefreshOrders=refresh;
  window.CIC_REFRESH_LIVE_ORDERS=refresh;
  document.addEventListener("click",e=>{
    const b=e.target.closest('[onclick*="adminTab"],[onclick*="adminView"]');
    if(b&&/orders/i.test(b.getAttribute("onclick")||"")) window.setTimeout(refresh,80);
  });
  const old=window.openAdmin;
  if(typeof old==="function") window.openAdmin=function(){const r=old.apply(this,arguments);window.setTimeout(refresh,120);return r;};
  if(client()) client().auth.onAuthStateChange((event,session)=>{ if(session) window.setTimeout(refresh,350); });

  window.addEventListener("cic:owner-orders-refresh",refresh);

  // Inventory workspace for approved team members. Reads use the restricted
  // team_list_inventory RPC; writes use the authenticated Edge Function.
  function mountTeamInventory() {
    if (document.getElementById("cicTeamInventoryButton")) return;
    const style=document.createElement("style");
    style.textContent=`
      #cicTeamInventoryButton{position:fixed;right:14px;bottom:220px;z-index:9997;background:#2C1A14;color:#FFF8E7;border:1px solid #D4AF37;border-radius:999px;padding:11px 15px;font:600 12px system-ui;box-shadow:0 5px 22px #2C1A1433}
      #cicTeamInventoryModal{display:none;position:fixed;inset:0;z-index:10001;background:#1c110ed9;overflow:auto;padding:10px;align-items:flex-start;justify-content:center}
      #cicTeamInventoryModal .cic-inv-panel{box-sizing:border-box;background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;border-radius:16px;width:min(980px,100%);margin:auto;padding:16px;font:14px system-ui}
      #cicTeamInventoryModal h2{font:normal 24px Georgia,serif;margin:0}
      #cicTeamInventoryModal .cic-inv-muted{font-size:12px;color:#77665b;margin-top:5px}
      #cicTeamInventoryModal button{border:1px solid #D4AF37;border-radius:8px;padding:9px 12px;background:#2C1A14;color:#FFF8E7;font-weight:650;cursor:pointer}
      #cicTeamInventoryModal button:disabled{opacity:.55}
      #cicTeamInventoryModal .cic-inv-card{border:1px solid #e2d5c4;border-radius:10px;padding:12px;margin:9px 0}
      #cicTeamInventoryModal .cic-inv-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
      #cicTeamInventoryModal label{display:block;font-size:11px;font-weight:700;color:#59463b}
      #cicTeamInventoryModal input{box-sizing:border-box;width:100%;min-height:38px;margin-top:4px;padding:7px;border:1px solid #9b806b;border-radius:7px;background:#fff;color:#24150f}
      #cicTeamInventoryModal .cic-inv-alert{color:#9a2f20;font-weight:750}
      @media(max-width:620px){#cicTeamInventoryButton{bottom:220px;right:9px}#cicTeamInventoryModal{padding:5px}#cicTeamInventoryModal .cic-inv-panel{padding:11px}#cicTeamInventoryModal .cic-inv-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
    const button=document.createElement("button");button.id="cicTeamInventoryButton";button.type="button";button.textContent="Team · Inventory";button.hidden=true;
    const modal=document.createElement("div");modal.id="cicTeamInventoryModal";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-label","Team inventory");
    modal.innerHTML='<section class="cic-inv-panel"><div style="display:flex;gap:10px;justify-content:space-between;align-items:flex-start"><div><h2>CRAVE ISLAND CEYLON · Inventory</h2><div class="cic-inv-muted">Approved team inventory view · access follows your assigned permissions.</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" id="cicTeamInventoryRefresh">Refresh</button><button type="button" id="cicTeamInventoryClose">Close ✕</button></div></div><div id="cicTeamInventoryStatus" role="status" aria-live="polite" style="padding:10px;border-radius:8px;background:#f0e5d4;margin:12px 0;color:#2C1A14">Checking team access…</div><div id="cicTeamInventoryRows"></div></section>';
    document.body.appendChild(button);document.body.appendChild(modal);
    const status=()=>document.getElementById("cicTeamInventoryStatus");
    const rows=()=>document.getElementById("cicTeamInventoryRows");
    const say=(message,bad=false)=>{const el=status();if(el){el.textContent=message;el.style.background=bad?"#f8deda":"#f0e5d4";}};
    const escape=esc;
    let canUpdate=false;
    async function inventoryAccess(){
      const db=client();if(!db)return {error:"Supabase connection is not ready."};
      const {data:{session},error}=await db.auth.getSession();
      if(error||!session||session.user?.is_anonymous)return {error:"Please sign in with an approved CRAVE team account."};
      const {data:staff,error:profileError}=await db.from("staff_profiles").select("role,approved,permissions").eq("id",session.user.id).maybeSingle();
      if(profileError||!staff||staff.approved!==true)return {error:"Approved team access is required."};
      const p=staff.permissions&&typeof staff.permissions==="object"?staff.permissions:{};
      const isOwner=staff.role==="owner";
      const read=isOwner||(Array.isArray(p.inventory)&&p.inventory.some(x=>x==="read"||x==="update"));
      canUpdate=isOwner||(Array.isArray(p.inventory)&&p.inventory.includes("update"));
      return read?{db}:{error:"Your account does not have inventory read permission."};
    }
    async function loadInventory(){
      const access=await inventoryAccess();
      if(access.error){button.hidden=true;modal.style.display="none";say(access.error,true);return;}
      button.hidden=false;
      say("Loading inventory…");
      const {data,error}=await access.db.rpc("team_list_inventory");
      if(error){say("Inventory could not be loaded. The secure inventory database migration must be applied first.",true);rows().innerHTML="";return;}
      if(!Array.isArray(data)||!data.length){say("No products are available in the inventory yet.");rows().innerHTML="";return;}
      say(data.length+" product(s) loaded.");
      rows().innerHTML=data.map(p=>{
        const qty=Number(p.stock_quantity||0),threshold=Number(p.low_stock_threshold||0);
        const low=!!p.track_inventory&&qty<=threshold;
        const date=p.expiry_date||"";
        return '<article class="cic-inv-card" data-cic-inv-card="'+escape(p.id)+'"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>'+escape(p.name||"Unnamed product")+'</b><span class="'+(low?'cic-inv-alert':'')+'">'+(low?'LOW STOCK':'Stock: '+qty)+'</span></div><div class="cic-inv-muted">'+escape(p.category||"Uncategorised")+' · Batch '+escape(p.batch_number||"—")+'</div><div class="cic-inv-grid"><label>Stock quantity<input data-field="stock_quantity" type="number" min="0" max="1000000" step="1" value="'+qty+'" '+(!canUpdate?'disabled':'')+'></label><label>Low-stock threshold<input data-field="low_stock_threshold" type="number" min="0" max="1000000" step="1" value="'+threshold+'" '+(!canUpdate?'disabled':'')+'></label><label>Expiry date<input data-field="expiry_date" type="date" value="'+escape(date)+'" '+(!canUpdate?'disabled':'')+'></label><label style="display:flex;align-items:center;gap:6px;padding-top:18px">Track stock <input data-field="track_inventory" type="checkbox" style="width:18px;min-height:18px" '+(p.track_inventory?'checked':'')+' '+(!canUpdate?'disabled':'')+'></label></div>'+(canUpdate?'<div style="display:flex;justify-content:flex-end;margin-top:10px"><button type="button" data-cic-inv-save="'+escape(p.id)+'">Save stock</button></div>':'')+'</article>';
      }).join("");
      rows().querySelectorAll("[data-cic-inv-save]").forEach(btn=>btn.addEventListener("click",async()=>{
        const card=btn.closest("[data-cic-inv-card]");if(!card)return;
        const value=field=>card.querySelector('[data-field="'+field+'"]');
        const qty=Number(value("stock_quantity").value),threshold=Number(value("low_stock_threshold").value);
        if(!Number.isSafeInteger(qty)||qty<0||qty>1000000||!Number.isSafeInteger(threshold)||threshold<0||threshold>1000000){say("Stock and threshold must be whole numbers from 0 to 1,000,000.",true);return;}
        const payload={product_id:btn.dataset.cicInvSave,stock_quantity:qty,low_stock_threshold:threshold,track_inventory:value("track_inventory").checked,expiry_date:value("expiry_date").value||null};
        btn.disabled=true;btn.textContent="Saving…";
        const {data,error}=await access.db.functions.invoke("update-product-inventory",{body:payload});
        if(error||!data||data.error){say((data&&data.error)||"Inventory save failed. Check the Edge Function deployment and try again.",true);btn.disabled=false;btn.textContent="Save stock";return;}
        say("Inventory saved successfully.");await loadInventory();
      }));
    }
    button.addEventListener("click",()=>{modal.style.display="flex";loadInventory();});
    document.getElementById("cicTeamInventoryClose").addEventListener("click",()=>modal.style.display="none");
    document.getElementById("cicTeamInventoryRefresh").addEventListener("click",loadInventory);
    modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none";});
    const db=client();if(db)db.auth.onAuthStateChange(()=>window.setTimeout(()=>{if(modal.style.display==="flex")loadInventory();else inventoryAccess().then(a=>{button.hidden=!!a.error;});},150));
    inventoryAccess().then(a=>{button.hidden=!!a.error;});
  }
  mountTeamInventory();
})();