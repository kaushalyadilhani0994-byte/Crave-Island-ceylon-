/* CRAVE ISLAND CEYLON — approved-owner catalogue manager.
 * Uses the existing Supabase browser client and database RLS; no service key.
 */
(function () {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = v => "LKR " + Number(v || 0).toLocaleString("en-LK", {maximumFractionDigits:2});
  let root, client, allowed = false, productRows = [];

  function style() {
    if ($("#cic-catalogue-admin-style")) return;
    const s=document.createElement("style"); s.id="cic-catalogue-admin-style";
    s.textContent=`
      #cicOwnerCatalogueButton{position:fixed;right:14px;bottom:120px;z-index:9998;background:#2C1A14;color:#FFF8E7;border:1px solid #D4AF37;border-radius:999px;padding:11px 15px;font:600 12px system-ui;box-shadow:0 5px 22px #2C1A1433}
      #cicOwnerCatalogue{position:fixed;inset:0;z-index:9999;background:#1c110ed9;display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:18px}
      #cicOwnerCatalogue .cic-panel{background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;border-radius:16px;width:min(900px,100%);margin:auto;padding:20px;box-shadow:0 15px 50px #0005;font:14px system-ui}
      #cicOwnerCatalogue h2,#cicOwnerCatalogue h3{margin:0 0 12px;color:#2C1A14}
      #cicOwnerCatalogue .cic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      #cicOwnerCatalogue label{display:block;font-size:12px;font-weight:650;margin:8px 0 4px}
      #cicOwnerCatalogue input,#cicOwnerCatalogue textarea,#cicOwnerCatalogue select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d6c7b5;border-radius:8px;background:white;color:#2C1A14;font:14px system-ui}
      #cicOwnerCatalogue textarea{min-height:64px;resize:vertical}
      #cicOwnerCatalogue button{border:1px solid #D4AF37;border-radius:8px;padding:10px 13px;background:#2C1A14;color:#FFF8E7;font-weight:650;cursor:pointer}
      #cicOwnerCatalogue button[disabled]{opacity:.55;cursor:wait}
      #cicOwnerCatalogue .cic-muted{color:#77665b;font-size:12px;line-height:1.5}
      #cicOwnerCatalogue .cic-card{border:1px solid #e2d5c4;border-radius:10px;padding:12px;margin:8px 0;display:flex;gap:12px;align-items:center;justify-content:space-between}
      #cicOwnerCatalogue .cic-message{padding:10px;border-radius:8px;background:#f0e5d4;margin:10px 0;white-space:pre-wrap}
      #cicOwnerCatalogue .cic-section{border-top:1px solid #e3d5c3;margin-top:18px;padding-top:16px}
      @media(max-width:600px){#cicOwnerCatalogue{padding:8px}#cicOwnerCatalogue .cic-panel{padding:14px}#cicOwnerCatalogue .cic-grid{grid-template-columns:1fr}#cicOwnerCatalogue .cic-card{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(s);
  }

  function mount() {
    if ($("#cicOwnerCatalogue")) return;
    style();
    const b=document.createElement("button"); b.id="cicOwnerCatalogueButton"; b.type="button"; b.textContent="Owner · Catalogue"; b.hidden=true;
    b.addEventListener("click",()=>{ const m=$("#cicOwnerCatalogue"); if(m){m.style.display="flex"; loadAll();} });
    document.body.appendChild(b);
    const m=document.createElement("div"); m.id="cicOwnerCatalogue"; m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true"); m.setAttribute("aria-label","Owner catalogue management");
    m.innerHTML=`<section class="cic-panel">
      <div style="display:flex;gap:12px;align-items:flex-start;justify-content:space-between"><div><h2>CRAVE ISLAND CEYLON</h2><div class="cic-muted">Live catalogue management · changes save to Supabase</div></div><button type="button" id="cicOwnerCatalogueClose" aria-label="Close">Close ✕</button></div>
      <div id="cicOwnerCatalogueMessage" class="cic-message" role="status">Checking owner access…</div>
      <div class="cic-section"><h3>1. Add a collection</h3><form id="cicCategoryForm">
        <div class="cic-grid"><div><label for="cicCatName">Category / subcategory name *</label><input id="cicCatName" maxlength="80" required></div><div><label for="cicCatParent">Parent category (leave blank for a main category)</label><select id="cicCatParent"><option value="">Main category</option></select></div><div><label for="cicCatImage">Collection image URL (optional)</label><input id="cicCatImage" type="url" maxlength="1500"></div></div>
        <label for="cicCatDesc">Description</label><textarea id="cicCatDesc" maxlength="500"></textarea>
        <button type="submit">Save collection</button>
      </form></div>
      <div class="cic-section"><h3>2. Add a real product</h3><p class="cic-muted">Only enter products that are actually ready to sell. Price is in LKR. Product image URL must be a publicly accessible HTTPS image URL.</p>
      <form id="cicProductForm">
        <div class="cic-grid"><div><label for="cicProdName">Product name *</label><input id="cicProdName" maxlength="160" required></div><div><label for="cicProdPrice">Price (LKR) *</label><input id="cicProdPrice" type="number" min="0.01" max="2000000" step="0.01" required></div>
        <div><label for="cicProdCategory">Collection *</label><select id="cicProdCategory" required><option value="">Create a collection first</option></select></div><div><label for="cicProdImage">Product image URL (optional)</label><input id="cicProdImage" type="url" maxlength="1500"></div></div>
        <label for="cicProdDesc">Product description</label><textarea id="cicProdDesc" maxlength="3000"></textarea>
        <label for="cicProdIngredients">Ingredients / allergen information *</label><textarea id="cicProdIngredients" maxlength="5000" required placeholder="Enter the verified ingredient list and clear allergen information"></textarea>
        <div class="cic-grid"><div><label for="cicProdBatch">Batch number (optional)</label><input id="cicProdBatch" maxlength="100"></div><div><label for="cicProdQr">QR code / traceability value (optional)</label><input id="cicProdQr" maxlength="500"></div><div><label for="cicProdStock">Stock quantity</label><input id="cicProdStock" type="number" min="0" max="1000000" step="1" value="0"></div><div><label for="cicProdLowStock">Low-stock warning threshold</label><input id="cicProdLowStock" type="number" min="0" max="1000000" step="1" value="5"></div><div><label for="cicProdExpiry">Expiry / best-before date</label><input id="cicProdExpiry" type="date"></div><div><label><input id="cicProdTrackStock" type="checkbox" style="width:auto"> Track stock and alerts for this product</label></div></div>
        <button type="submit">Save product as draft</button>
      </form></div>
      <div class="cic-section"><div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><h3>3. Live catalogue</h3><button type="button" id="cicOwnerCatalogueRefresh">Refresh</button></div><div id="cicOwnerCatalogueList" aria-live="polite"></div></div>
    </section>`;
    m.addEventListener("click",e=>{if(e.target===m)m.style.display="none";});
    $("#cicOwnerCatalogueClose",m).addEventListener("click",()=>m.style.display="none");
    $("#cicOwnerCatalogueRefresh",m).addEventListener("click",loadAll);
    $("#cicCategoryForm",m).addEventListener("submit",saveCategory);
    $("#cicProductForm",m).addEventListener("submit",saveProduct);
    document.body.appendChild(m); root=m;
  }

  function say(message, bad=false) {
    const el=$("#cicOwnerCatalogueMessage"); if(!el)return;
    el.textContent=message; el.style.background=bad?"#f8deda":"#f0e5d4";
  }

  async function checkAccess() {
    client=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
    if(!client){allowed=false;return false;}
    const {data:{session},error}=await client.auth.getSession();
    if(error||!session){allowed=false;return false;}
    const {data:staff,error:staffError}=await client.from("staff_profiles").select("role,approved").eq("id",session.user.id).maybeSingle();
    allowed=!staffError&&!!staff&&staff.role==="owner"&&staff.approved===true;
    return allowed;
  }

  async function loadAll() {
    if(!await checkAccess()){say("Sign in using the approved owner account to manage the catalogue.",true);return;}
    say("Loading collections and products…");
    const [cats,products]=await Promise.all([
      client.from("categories").select("id,name,description,image_url,is_active,sort_order,parent_id").order("sort_order").order("name"),
      client.from("products").select("id,name,category,price,currency,is_active,ingredients,batch_number,qr_code,description,image_url,stock_quantity,low_stock_threshold,track_inventory,expiry_date,sku").order("created_at",{ascending:false})
    ]);
    if(cats.error||products.error){say("Catalogue could not be loaded. Check the categories/products table access and try Refresh.",true);return;}
    productRows=products.data||[];
    const select=$("#cicProdCategory");
    select.innerHTML='<option value="">Choose a category or subcategory</option>'+(cats.data||[]).filter(c=>c.is_active).map(c=>{const parent=(cats.data||[]).find(p=>p.id===c.parent_id);return '<option value="'+esc(c.name)+'">'+(parent?esc(parent.name)+' › ':'')+esc(c.name)+'</option>';}).join("");
     const parentSelect=$("#cicCatParent"); if(parentSelect)parentSelect.innerHTML='<option value="">Main category</option>'+(cats.data||[]).filter(c=>!c.parent_id).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join("");
    const catList=(cats.data||[]).map(c=>{const parent=(cats.data||[]).find(p=>p.id===c.parent_id);return '<div class="cic-card"><div><b>'+(parent?esc(parent.name)+' › ':'')+esc(c.name)+'</b><div class="cic-muted">'+(c.parent_id?"Subcategory · ":"Main category · ")+(c.is_active?"Active":"Hidden")+'</div></div><button type="button" data-cic-category-toggle="'+esc(c.id)+'" data-active="'+String(!!c.is_active)+'">'+(c.is_active?"Hide":"Activate")+'</button></div>';}).join("");
    const prodList=productRows.map(p=>'<div class="cic-card"><div><b>'+esc(p.name)+'</b><div class="cic-muted">'+esc(p.category||"Uncategorised")+' · '+money(p.price)+' · '+(p.is_active?"Active":"Hidden")+'</div><div class="cic-muted">'+(p.track_inventory?"Stock: "+Number(p.stock_quantity||0)+" · Low-stock threshold: "+Number(p.low_stock_threshold||5):"Stock tracking off")+(p.expiry_date?" · Best before: "+esc(p.expiry_date):" · No expiry date recorded")+(p.sku?" · SKU: "+esc(p.sku):"") +'</div></div><div><button type="button" data-cic-product-edit="'+esc(p.id)+'">Edit details</button> <button type="button" data-cic-product-toggle="'+esc(p.id)+'" data-active="'+String(!!p.is_active)+'">'+(p.is_active?"Hide product":"Activate product")+'</button></div></div>').join("");
    $("#cicOwnerCatalogueList").innerHTML='<h3 style="margin-top:14px">Collections ('+(cats.data||[]).length+')</h3>'+(catList||'<p class="cic-muted">No collections yet. Create one above.</p>')+'<h3 style="margin-top:18px">Products ('+(products.data||[]).length+')</h3>'+(prodList||'<p class="cic-muted">No products yet. Add verified product details above.</p>');
    $("#cicOwnerCatalogueList").querySelectorAll("[data-cic-category-toggle]").forEach(btn=>btn.addEventListener("click",()=>toggleRow("categories",btn.getAttribute("data-cic-category-toggle"),btn.getAttribute("data-active")==="true")));
    $("#cicOwnerCatalogueList").querySelectorAll("[data-cic-product-toggle]").forEach(btn=>btn.addEventListener("click",()=>toggleRow("products",btn.getAttribute("data-cic-product-toggle"),btn.getAttribute("data-active")==="true")));
    $("#cicOwnerCatalogueList").querySelectorAll("[data-cic-product-edit]").forEach(btn=>btn.addEventListener("click",()=>editProduct(btn.getAttribute("data-cic-product-edit"))));
    say("Connected. "+(cats.data||[]).length+" collections and "+(products.data||[]).length+" products loaded.");
  }

  function editProduct(id) {
    const p=productRows.find(row=>String(row.id)===String(id)); if(!p)return;
    const form=$("#cicProductForm"); form.dataset.editId=p.id;
    $("#cicProdName").value=p.name||""; $("#cicProdPrice").value=p.price==null?"":p.price;
    const categorySelect=$("#cicProdCategory");
    if(p.category&&!Array.from(categorySelect.options).some(option=>option.value===p.category)){
      const option=document.createElement("option"); option.value=p.category; option.textContent=p.category+" (inactive collection)"; categorySelect.appendChild(option);
    }
    categorySelect.value=p.category||""; $("#cicProdImage").value=p.image_url||"";
    $("#cicProdDesc").value=p.description||""; $("#cicProdIngredients").value=p.ingredients||"";
    $("#cicProdBatch").value=p.batch_number||""; $("#cicProdQr").value=p.qr_code||""; $("#cicProdStock").value=Number(p.stock_quantity||0); $("#cicProdLowStock").value=Number(p.low_stock_threshold||5); $("#cicProdExpiry").value=p.expiry_date||""; $("#cicProdTrackStock").checked=Boolean(p.track_inventory);
    const button=form.querySelector("button[type=submit]"); if(button)button.textContent="Update live product";
    say("Editing "+p.name+". Save changes to update the live catalogue."); form.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function toggleRow(table,id,isActive) {
    if(!await checkAccess()){say("Owner session expired. Please sign in again.",true);return;}
    if(table==="categories"){
      const {data:cat}=await client.from("categories").select("id,parent_id").eq("id",id).maybeSingle();
      if(cat&&!cat.parent_id&&!isActive){
        const {error:childrenError}=await client.from("categories").update({is_active:false}).eq("parent_id",id);
        if(childrenError){say("Could not safely hide this category and its subcategories.",true);return;}
      }
    }

    // Keep incomplete/test records out of the public shop. Deactivation is always allowed.
    if(table==="products"&&!isActive){
      const {data:product,error:productError}=await client.from("products")
        .select("name,category,price,currency,ingredients").eq("id",id).maybeSingle();
      if(productError||!product){say("Could not verify this product. Refresh the catalogue and try again.",true);return;}
      const name=String(product.name||"").trim();
      if(/prototype|not\s+for\s+sale|test\s+product|sample\s+only/i.test(name)){
        say("This looks like a prototype or test item. Rename it with the verified sale product name before activation.",true);return;
      }
      if(!name||!String(product.ingredients||"").trim()||!Number.isFinite(Number(product.price))||Number(product.price)<=0||product.currency!=="LKR"){
        say("This product is missing verified ingredients or a valid LKR price. Complete and verify its details before activation.",true);return;
      }
      const {data:category,error:categoryError}=await client.from("categories")
        .select("is_active").eq("name",product.category).maybeSingle();
      if(categoryError||!category||category.is_active!==true){
        say("Activate the product's collection first. A product cannot be published under a hidden or missing collection.",true);return;
      }
    }

    const {error}=await client.from(table).update({is_active:!isActive}).eq("id",id);
    if(error){say("Could not update this item. Confirm owner permissions and try again.",true);return;}
    say((isActive?"Hidden":"Activated")+" successfully."); await loadAll();
    if(window.CIC_SUPABASE&&typeof window.CIC_SUPABASE.refreshCatalogue==="function") await window.CIC_SUPABASE.refreshCatalogue();
  }

  async function saveCategory(event) {
    event.preventDefault(); if(!await checkAccess()){say("Owner access required.",true);return;}
    const name=$("#cicCatName").value.trim(), parentId=$("#cicCatParent").value||null;
    if(!name){say("Enter a collection name.",true);return;}
    const btn=event.submitter; if(btn){btn.disabled=true;btn.textContent="Saving…";}
    const {data:existingCategories}=await client.from("categories").select("sort_order").eq("parent_id",parentId);
     const sortOrder=Math.max(0,...(existingCategories||[]).map(x=>Number(x.sort_order)||0))+1;
     const {error}=await client.from("categories").insert({name,parent_id:parentId,sort_order:sortOrder,description:$("#cicCatDesc").value.trim()||null,image_url:$("#cicCatImage").value.trim()||null,is_active:true});
    if(btn){btn.disabled=false;btn.textContent="Save collection";}
    if(error){say(error.code==="23505"?"That collection name already exists.":"Could not save collection. Check the fields and owner permissions.",true);return;}
    event.target.reset(); say("Collection saved."); await loadAll();
    if(window.CIC_SUPABASE&&typeof window.CIC_SUPABASE.refreshCatalogue==="function") await window.CIC_SUPABASE.refreshCatalogue();
  }

  async function saveProduct(event) {
    event.preventDefault(); if(!await checkAccess()){say("Owner access required.",true);return;}
    const name=$("#cicProdName").value.trim(), category=$("#cicProdCategory").value, price=Number($("#cicProdPrice").value);
    const ingredients=$("#cicProdIngredients").value.trim(), imageUrl=$("#cicProdImage").value.trim();
    if(!name||!category||!ingredients||!Number.isFinite(price)||price<=0||price>2000000){say("Enter product name, collection, verified ingredients/allergens, and a valid LKR price.",true);return;}
    if(imageUrl&&!/^https:\/\//i.test(imageUrl)){say("Product image URL must start with https://.",true);return;}
    const btn=event.submitter; if(btn){btn.disabled=true;btn.textContent="Saving…";}
    const editId=event.target.dataset.editId||"";
    const existingProduct=productRows.find(row=>String(row.id)===String(editId));
    // New products remain hidden drafts until an owner explicitly activates them after review.
    // Editing an existing product must preserve its current visibility state.
    const stockQuantity=Number($("#cicProdStock").value||0), lowStockThreshold=Number($("#cicProdLowStock").value||5), expiryDate=$("#cicProdExpiry").value||null;
     if(!Number.isInteger(stockQuantity)||stockQuantity<0||!Number.isInteger(lowStockThreshold)||lowStockThreshold<0){say("Stock and low-stock threshold must be whole numbers of zero or more.",true);if(btn){btn.disabled=false;btn.textContent=editId?"Update live product":"Save product as draft";}return;}
     const row={name,category,price,currency:"LKR",description:$("#cicProdDesc").value.trim()||null,image_url:imageUrl||null,ingredients,batch_number:$("#cicProdBatch").value.trim()||null,qr_code:$("#cicProdQr").value.trim()||null,stock_quantity:stockQuantity,low_stock_threshold:lowStockThreshold,expiry_date:expiryDate,track_inventory:$("#cicProdTrackStock").checked,is_active:editId?Boolean(existingProduct&&existingProduct.is_active):false};
    const result=editId?await client.from("products").update(row).eq("id",editId):await client.from("products").insert(row);
    if(btn){btn.disabled=false;btn.textContent=editId?"Update live product":"Save product to live shop";}
    if(result.error){say("Could not save changes. Check the fields and owner permissions.",true);return;}
    event.target.reset(); delete event.target.dataset.editId; const saveButton=event.target.querySelector("button[type=submit]"); if(saveButton)saveButton.textContent="Save product as draft";
    say(editId?"Product details updated; its previous visibility setting was preserved.":"Product saved as a hidden draft. Review the details and activate it only when ready to sell."); await loadAll();
    if(window.CIC_SUPABASE&&typeof window.CIC_SUPABASE.refreshCatalogue==="function") await window.CIC_SUPABASE.refreshCatalogue();
  }

  function init() {
    if(!window.CIC_SUPABASE_CONFIG||!window.CIC_SUPABASE_CONFIG.anonKey)return;
    mount();
    const update=async()=>{const ok=await checkAccess(); const b=$("#cicOwnerCatalogueButton"); if(b)b.hidden=!ok;};
    update();
    const db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
    if(db)db.auth.onAuthStateChange(()=>window.setTimeout(update,150));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>window.setTimeout(init,250));
  else window.setTimeout(init,250);
})();