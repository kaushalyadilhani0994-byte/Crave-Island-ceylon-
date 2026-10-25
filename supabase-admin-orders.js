/* CRAVE ISLAND CEYLON — live owner order management */
(function () {
  "use strict";
  const client = () => window.CIC_SUPABASE && window.CIC_SUPABASE.client;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = (v) => "LKR " + Number(v || 0).toLocaleString("en-LK", {maximumFractionDigits:2});
  const next = {pending:["confirmed","cancelled"],confirmed:["processing","cancelled"],processing:["shipped","cancelled"],shipped:["delivered"],delivered:[],cancelled:[]};
  async function access() {
    const db=client(); if(!db) return {error:"Supabase connection is not ready."};
    const {data:{session},error}=await db.auth.getSession();
    if(error||!session) return {error:"Please sign in with the approved owner account first."};
    const {data:staff,error:se}=await db.from("staff_profiles").select("role,approved").eq("id",session.user.id).maybeSingle();
    if(se||!staff||staff.role!=="owner"||staff.approved!==true) return {error:"This section is only available to an approved owner."};
    return {db};
  }
  function notice(el,msg){ if(el) el.innerHTML='<div class="admin-note">'+esc(msg)+'</div>'; }
  async function refresh() {
    const el=document.getElementById("adminOrderTable"); if(!el)return;
    notice(el,"Loading live orders from Supabase…");
    const a=await access(); if(a.error){notice(el,a.error);return;}
    const {data:orders,error}=await a.db.from("store_orders").select("id,order_number,customer_name,email,phone,shipping_address,subtotal,delivery_fee,total,currency,payment_method,payment_status,order_status,customer_note,created_at").order("created_at",{ascending:false}).limit(100);
    if(error){notice(el,"Could not load live orders. Check the owner access policy and try again.");return;}
    if(!orders||!orders.length){notice(el,"No real customer orders yet. New successful checkouts will appear here.");return;}
    const {data:items,error:itemError}=await a.db.from("store_order_items").select("order_id,product_name,quantity,unit_price,line_total").in("order_id",orders.map(o=>o.id));
    if(itemError){notice(el,"Orders loaded, but item details could not be retrieved.");return;}
    const byOrder={}; (items||[]).forEach(i=>(byOrder[i.order_id]||(byOrder[i.order_id]=[])).push(i));
    el.innerHTML=orders.map(o=>{
      const st=String(o.order_status||"pending").toLowerCase();
      const options=(next[st]||[]).map(n=>'<option value="'+n+'">'+n.replace(/^./,c=>c.toUpperCase())+'</option>').join("");
      const addr=o.shipping_address&&typeof o.shipping_address==="object"?Object.values(o.shipping_address).filter(Boolean).join(", "):String(o.shipping_address||"");
      const lines=(byOrder[o.id]||[]).map(i=>esc(i.product_name)+" × "+Number(i.quantity)+" ("+money(i.line_total)+")").join("<br>")||"Item details unavailable";
      return '<article class="table-row" style="display:block;padding:14px;margin:10px 0;border:1px solid #e6dccb;border-radius:12px">'+
        '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between"><b>'+esc(o.order_number||o.id)+'</b><b>'+money(o.total)+'</b></div>'+
        '<div style="margin-top:7px">'+esc(o.customer_name)+' · '+esc(o.phone||"No phone")+' · '+esc(o.email||"No email")+'</div>'+
        '<div style="margin-top:5px;color:#75645a;font-size:12px">'+esc(addr)+'</div>'+
        '<div style="margin-top:9px;font-size:13px">'+lines+'</div>'+
        '<div style="margin-top:9px;font-size:12px">Payment: '+esc(o.payment_method)+' / '+esc(o.payment_status)+' · Status: <b>'+esc(st)+'</b></div>'+
        (o.customer_note?'<div style="margin-top:5px;font-size:12px">Note: '+esc(o.customer_note)+'</div>':"")+
        '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px"><label style="font-size:12px">Update status</label><select data-cic-order-status="'+esc(o.id)+'" '+(!options?'disabled':'')+' style="max-width:190px;padding:8px;border-radius:8px;border:1px solid #d4c6b5">'+(options||'<option>No further changes</option>')+'</select><button class="secondary-btn" data-cic-save-order="'+esc(o.id)+'" '+(!options?'disabled':'')+'>Save status</button></div></article>';
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
    button.id="cicOwnerOrdersButton";button.type="button";button.textContent="Owner · Orders";button.hidden=true;
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
      const db=client();let approved=false;
      try{
        if(db){const {data:{session},error}=await db.auth.getSession();if(session&&!error){const {data,error:profileError}=await db.from("staff_profiles").select("role,approved").eq("id",session.user.id).maybeSingle();approved=!profileError&&!!data&&data.role==="owner"&&data.approved===true;}}
      }catch(_){}
      button.hidden=!approved;
      if(!approved)modal.style.display="none";
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
})();