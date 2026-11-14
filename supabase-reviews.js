/* CRAVE ISLAND CEYLON — verified-purchase reviews */
(function(){
  "use strict";
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let localClient=null, adminMounted=false;
  function db(){
    if(window.CIC_SUPABASE&&window.CIC_SUPABASE.client)return window.CIC_SUPABASE.client;
    if(localClient)return localClient;
    const cfg=window.CIC_SUPABASE_CONFIG||{};
    if(window.supabase&&cfg.url&&cfg.anonKey)localClient=window.supabase.createClient(cfg.url,cfg.anonKey);
    return localClient;
  }
  function stars(n){return "★".repeat(Number(n)||0)+"☆".repeat(5-(Number(n)||0));}
  function reviewCard(r){
    const date=r.created_at?new Date(r.created_at).toLocaleDateString("en-LK",{year:"numeric",month:"short",day:"numeric"}):"";
    return '<article class="cic-review-card"><div class="cic-review-top"><strong>'+esc(r.product_name||"CRAVE ISLAND CEYLON")+'</strong><span class="cic-review-stars" aria-label="'+Number(r.rating)+' out of 5 stars">'+stars(r.rating)+'</span></div><h4>'+esc(r.review_title)+'</h4><p>'+esc(r.review_body)+'</p><small>Verified purchase · '+esc(date)+'</small></article>';
  }
  async function loadPublic(container,productId){
    const client=db(); if(!container)return;
    if(!client){container.innerHTML='<p class="cic-review-note">The secure reviews service is being prepared. Customer reviews will appear here when it is connected.</p>';return false;}
    container.innerHTML='<p class="cic-review-note">Loading approved customer reviews…</p>';
    const {data,error}=await client.rpc("get_public_product_reviews",{p_product_id:productId||null,p_limit:30,p_offset:0});
    if(error){container.innerHTML='<p class="cic-review-note">The secure reviews service is being prepared. Review submissions will open when the service is connected.</p>';return false;}
    const rows=Array.isArray(data)?data:[];
    container.innerHTML=rows.length?rows.map(reviewCard).join(""):'<p class="cic-review-note">No approved customer reviews yet. Genuine verified-purchase reviews will appear here after owner approval.</p>';
    return true;
  }
  async function loadProductOptions(select){
    const client=db(); if(!client||!select)return;
    const {data,error}=await client.from("products").select("id,name").eq("is_active",true).order("name");
    if(error)return;
    select.innerHTML='<option value="">Choose the product you purchased</option>'+(data||[]).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
  }
  function reviewFormMarkup(productId){
    return '<form class="cic-review-form" data-product="'+esc(productId||"")+'">'+
      (productId?'':'<label>Product<select name="product_id" required><option value="">Loading products…</option></select></label>')+
      '<label>Delivered order number<input name="order_number" autocomplete="off" maxlength="40" required placeholder="Enter your order number"></label>'+
      '<label>Rating<select name="rating" required><option value="">Choose rating</option><option value="5">5 — Excellent</option><option value="4">4 — Very good</option><option value="3">3 — Good</option><option value="2">2 — Fair</option><option value="1">1 — Poor</option></select></label>'+
      '<label>Review title<input name="title" maxlength="100" minlength="3" required placeholder="A short title"></label>'+
      '<label>Your review<textarea name="review_body" minlength="10" maxlength="2000" rows="4" required placeholder="Share your genuine product experience"></textarea></label>'+
      '<button type="submit">Submit review for approval</button><p class="cic-review-note" data-review-status>Only a delivered order on your signed-in account can be reviewed. Your review appears publicly only after owner approval.</p></form>';
  }
  async function bindReviewForm(form,productId){
    const client=db(); if(!client||!form)return;
    if(!productId){await loadProductOptions(form.querySelector('[name="product_id"]'));}
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      const status=form.querySelector("[data-review-status]"),button=form.querySelector("button[type=submit]");
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError||!session){status.textContent="Please sign in with the same account used to place the order.";return;}
      const selected=productId||form.querySelector('[name="product_id"]').value;
      button.disabled=true;status.textContent="Checking delivered order and submitting securely…";
      const {data,error}=await client.rpc("submit_verified_product_review",{
        p_order_number:form.elements.order_number.value.trim(),
        p_product_id:selected,
        p_rating:Number(form.elements.rating.value),
        p_title:form.elements.title.value.trim(),
        p_review_body:form.elements.review_body.value.trim()
      });
      button.disabled=false;
      if(error){
        const m=String(error.message||"");
        if(m.includes("VERIFIED_DELIVERED_PURCHASE_REQUIRED"))status.textContent="We could not verify a delivered purchase for this product and account. Reviews are available after delivery.";
        else if(m.includes("REVIEW_ALREADY_SUBMITTED"))status.textContent="A review has already been submitted for this product and order.";
        else if(m.includes("CUSTOMER_SIGN_IN_REQUIRED"))status.textContent="Please sign in with your customer account first.";
        else status.textContent="The review could not be submitted. Check the details and try again.";
        return;
      }
      form.reset();status.textContent="Thank you. Your verified review has been sent to the owner for approval.";
    });
  }
  async function renderProductReviews(productId){
    const root=document.getElementById("cicProductReviews");if(!root)return;
    root.innerHTML='<h2>Customer Reviews</h2><div id="cicProductReviewList"></div><h3>Share your experience</h3>'+reviewFormMarkup(productId);
    await loadPublic(root.querySelector("#cicProductReviewList"),productId);
    await bindReviewForm(root.querySelector("form"),productId);
  }
  async function renderModal(){
    const empty=document.getElementById("cicPublicReviewsEmpty");
    if(!empty)return;
    empty.innerHTML='<div id="cicPublicReviewList"></div><h4>Share your experience</h4>'+reviewFormMarkup("");
    await loadPublic(empty.querySelector("#cicPublicReviewList"),null);
    await bindReviewForm(empty.querySelector("form"),null);
  }
  async function owner(){
    const client=db();if(!client)return false;
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user||String(user.email||"").toLowerCase()!=="kaushalyadilhani0994@gmail.com")return false;
    const {data,error:profileError}=await client.from("staff_profiles").select("role,approved").eq("id",user.id).maybeSingle();
    return !profileError&&data&&data.role==="owner"&&data.approved===true;
  }
  async function showAdmin(){
    const root=document.getElementById("cicOwnerReviewsModal");if(!root)return;
    if(!await owner()){root.innerHTML='<section style="max-width:720px;margin:24px auto;background:#fff8e7;color:#2c1a14;border-radius:16px;padding:18px">Approved Main Admin access is required.</section>';root.style.display="block";return;}
    root.innerHTML='<section style="max-width:720px;margin:24px auto;background:#fff8e7;color:#2c1a14;border:1px solid #d4af37;border-radius:16px;padding:18px;font:14px system-ui"><div class="cic-review-admin-head"><h3>Customer Reviews</h3><button type="button" id="cicReviewAdminClose">Close</button></div><p class="cic-review-note">Only approved reviews are visible to customers. Approve genuine feedback or reject content that is not suitable.</p><div id="cicOwnerReviewRows">Loading pending reviews…</div></section>';
    root.querySelector("#cicReviewAdminClose").onclick=()=>root.style.display="none";
    const refresh=async()=>{
      const list=root.querySelector("#cicOwnerReviewRows");
      const {data,error}=await db().rpc("owner_list_product_reviews",{p_status:"pending"});
      if(error){list.textContent="Pending reviews could not be loaded.";return;}
      if(!data||!data.length){list.innerHTML='<p class="cic-review-note">There are no reviews waiting for approval.</p>';return;}
      list.innerHTML=data.map(r=>'<article class="cic-review-card"><div class="cic-review-top"><strong>'+esc(r.product_name)+'</strong><span>'+stars(r.rating)+'</span></div><h4>'+esc(r.review_title)+'</h4><p>'+esc(r.review_body)+'</p><small>Order '+esc(r.order_number)+' · '+esc(new Date(r.created_at).toLocaleString())+'</small><div class="cic-review-admin-actions"><button type="button" data-review-id="'+esc(r.review_id)+'" data-next="approved">Approve</button><button type="button" data-review-id="'+esc(r.review_id)+'" data-next="rejected">Reject</button></div></article>').join("");
      list.querySelectorAll("[data-review-id]").forEach(button=>button.addEventListener("click",async()=>{
        button.disabled=true;
        const {error:moderationError}=await db().rpc("owner_moderate_product_review",{p_review_id:button.dataset.reviewId,p_next_status:button.dataset.next});
        if(moderationError){button.disabled=false;window.alert("Could not save the moderation decision. Please refresh and try again.");return;}
        await refresh();
      }));
    };
    root.style.display="block";
    await refresh();
  }
  function mountAdmin(){
    const grid=document.querySelector("#admin-overview .control-grid");
    if(!grid||document.getElementById("cicOwnerReviewsCard"))return;
    const card=document.createElement("button");
    card.type="button";card.id="cicOwnerReviewsCard";card.className="control-card";
    card.innerHTML="<h4>Customer Reviews</h4><p>Review verified customer feedback and approve public reviews.</p><b>Open Review Moderation</b><div class=\"mini\">Owner-only approval</div>";
    card.addEventListener("click",showAdmin);
    grid.insertBefore(card, grid.firstElementChild);
    if(!document.getElementById("cicOwnerReviewsModal")){
      const modal=document.createElement("div");modal.id="cicOwnerReviewsModal";
      modal.style.cssText="display:none;position:fixed;inset:0;z-index:10030;overflow:auto;background:#1c110ed9;padding:14px";
      document.body.appendChild(modal);
    }
  }
  const style=document.createElement("style");
  style.textContent=".cic-review-card{border:1px solid #e6d8c3;border-radius:12px;padding:13px;margin:10px 0;background:#fffdf7;color:#2c1a14}.cic-review-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.cic-review-card h4{margin:8px 0 4px}.cic-review-card p{margin:4px 0 10px;white-space:pre-wrap}.cic-review-card small,.cic-review-note{color:#78665a;font-size:12px}.cic-review-stars{color:#9a7419;letter-spacing:1px}.cic-review-form{display:grid;gap:9px;margin:12px 0;padding:14px;border:1px solid #e6d8c3;border-radius:12px;background:#fffdf7}.cic-review-form label{display:grid;gap:5px;font-weight:700;font-size:12px}.cic-review-form input,.cic-review-form textarea,.cic-review-form select{width:100%;box-sizing:border-box;border:1px solid #b9a48c;border-radius:8px;padding:10px;background:#fff;color:#2c1a14;font:14px system-ui}.cic-review-form button,.cic-review-admin-actions button,.cic-review-admin-head button{border:1px solid #d4af37;border-radius:999px;background:#2c1a14;color:#fff8e7;padding:10px 14px;font-weight:700}.cic-review-admin-actions{display:flex;gap:8px;margin-top:10px}.cic-review-admin-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.cic-review-admin-head h3{margin:0}";
  document.head.appendChild(style);
  window.CIC_RENDER_PRODUCT_REVIEWS=renderProductReviews;
  const baseOpen=window.openModal;
  if(typeof baseOpen==="function")window.openModal=function(id){const result=baseOpen.apply(this,arguments);if(id==="reviewsModal")setTimeout(renderModal,0);return result;};
  async function syncAdminCard(){
    const ok=await owner();
    const existing=document.getElementById("cicOwnerReviewsCard");
    if(ok&&document.getElementById("admin-overview")){mountAdmin();adminMounted=true;}
    else if(existing){existing.remove();adminMounted=false;}
  }
  const watch=new MutationObserver(()=>{if(!adminMounted&&document.body.classList.contains("cic-owner-shortcuts-unified"))syncAdminCard();});
  if(document.body)watch.observe(document.body,{childList:true,subtree:true});
  const client=db();if(client)client.auth.onAuthStateChange(()=>setTimeout(syncAdminCard,0));
  syncAdminCard();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{if(location.search.includes("open=reviews"))renderModal();},{once:true});
  else if(location.search.includes("open=reviews"))renderModal();
})();