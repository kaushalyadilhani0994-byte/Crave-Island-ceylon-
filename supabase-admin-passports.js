/* CRAVE ISLAND CEYLON — approved-owner product passport publishing */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let db;
async function owner(){
db=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
if(!db)return false;
const {data:{session},error}=await db.auth.getSession();
if(error||!session)return false;
const {data,error:e}=await db.from("staff_profiles").select("role,approved").eq("id",session.user.id).maybeSingle();
return !e&&data&&data.role==="owner"&&data.approved===true;
}
function mount(){
if($("#cicPassportAdmin"))return;
const style=document.createElement("style");style.textContent="#cicPassportButton{position:fixed;right:14px;bottom:70px;z-index:9998;background:#FFF8E7;color:#2C1A14;border:1px solid #D4AF37;border-radius:999px;padding:10px 14px;font:600 12px system-ui;box-shadow:0 5px 22px #2C1A1433}#cicPassportAdmin{display:none;position:fixed;inset:0;z-index:10000;background:#1c110ed9;overflow:auto;padding:12px;align-items:flex-start;justify-content:center}#cicPassportAdmin .panel{background:#FFF8E7;color:#2C1A14;border-radius:16px;border:1px solid #D4AF37;width:min(760px,100%);margin:auto;padding:20px;font:14px system-ui}#cicPassportAdmin .panel{color:#2C1A14!important}#cicPassportAdmin label{display:block!important;color:#24150f!important;font-size:12px;font-weight:750;margin:9px 0 4px}#cicPassportAdmin input:not([type=checkbox]),#cicPassportAdmin textarea,#cicPassportAdmin select{background-color:#fff!important;color:#24150f!important;-webkit-text-fill-color:#24150f!important;caret-color:#24150f!important}#cicPassportAdmin input::placeholder,#cicPassportAdmin textarea::placeholder{color:#6b5a50!important;opacity:1!important}#cicPassportAdmin .panel h2{color:#2C1A14!important}#cicPassportAdmin .panel p{color:#59463b!important}#cicPassportAdmin button{background-color:#2C1A14!important;color:#FFF8E7!important;-webkit-text-fill-color:#FFF8E7!important}#cicPassportAdmin .msg{color:#2C1A14!important}#cicPassportAdmin input,#cicPassportAdmin textarea,#cicPassportAdmin select{width:100%;min-height:42px;box-sizing:border-box;padding:10px;border:1px solid #9b806b;border-radius:8px;background:#fff;color:#24150f;font:14px system-ui}#cicPassportAdmin input::placeholder,#cicPassportAdmin textarea::placeholder{color:#6b5a50;opacity:1}#cicPassportAdmin input:focus,#cicPassportAdmin textarea:focus,#cicPassportAdmin select:focus{outline:3px solid #D4AF37;outline-offset:1px;border-color:#2C1A14}#cicPassportAdmin textarea{min-height:65px}#cicPassportAdmin .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#cicPassportAdmin button{background:#2C1A14;color:#FFF8E7;border:1px solid #D4AF37;border-radius:8px;padding:10px 13px;font-weight:650}#cicPassportAdmin .msg{padding:10px;background:#f0e5d4;border-radius:8px;margin:10px 0;overflow-wrap:anywhere}#cicPassportAdmin img{width:180px;height:180px;object-fit:contain;background:white}@media(max-width:560px){#cicPassportAdmin .grid{grid-template-columns:1fr}}";document.head.appendChild(style);
const b=document.createElement("button");b.id="cicPassportButton";b.hidden=true;b.textContent="Owner · QR Passports";b.onclick=async()=>{const p=$("#cicPassportAdmin");p.style.display="flex";await loadProducts()};document.body.appendChild(b);
const modal=document.createElement("div");modal.id="cicPassportAdmin";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
modal.innerHTML='<section class="panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">Product QR Passport</h2><p style="margin:5px 0;color:#79685d">Publish verified product details for QR scans.</p></div><button id="cicPassportClose" type="button">Close ✕</button></div><div id="cicPassportMsg" class="msg" role="status">Choose a product and enter verified pack information.</div><form id="cicPassportForm"><label for="cicPassProduct">Product *</label><select id="cicPassProduct" required><option value="">Loading products…</option></select><div class="grid"><div><label for="cicPassOrigin">Origin</label><input id="cicPassOrigin" maxlength="180" placeholder="Only enter a verified origin"></div><div><label for="cicPassBatch">Batch / lot</label><input id="cicPassBatch" maxlength="100"></div><div><label for="cicPassMfg">Manufacturing date</label><input id="cicPassMfg" type="date"></div><div><label for="cicPassBest">Best before / expiry</label><input id="cicPassBest" type="date"></div><div><label for="cicPassStorage">Storage instructions</label><input id="cicPassStorage" maxlength="500"></div></div><label for="cicPassIngredients">Ingredients *</label><textarea id="cicPassIngredients" maxlength="5000" required placeholder="Exact verified ingredient list"></textarea><label for="cicPassAllergens">Allergen information</label><textarea id="cicPassAllergens" maxlength="2000" placeholder="Declared allergens and cross-contact notes, if verified"></textarea><label for="cicPassStory">Product story</label><textarea id="cicPassStory" maxlength="2000" placeholder="Accurate product story; avoid unverified health claims"></textarea><label><input id="cicPassPublished" type="checkbox" style="width:auto"> Publish publicly so the QR page can be viewed</label><button id="cicPassSave" type="submit">Save product passport</button></form><div id="cicPassResult"></div></section>';
document.body.appendChild(modal);
$("#cicPassportClose").onclick=()=>modal.style.display="none";
$("#cicPassportForm").addEventListener("submit",save);
}
function message(t){const e=$("#cicPassportMsg");if(e)e.textContent=t}
async function loadProducts(){
if(!await owner()){message("Sign in with the approved owner account to manage product passports.");return}
const {data,error}=await db.from("products").select("id,name,batch_number,ingredients,manufacturing_date,expiry_date,is_active").order("name");
if(error){message("Could not load products. Check the owner access policy and try again.");return}
const sel=$("#cicPassProduct");sel.innerHTML='<option value="">Choose a product</option>'+(data||[]).map(p=>'<option value="'+esc(p.id)+'" data-batch="'+esc(p.batch_number||"")+'" data-ingredients="'+esc(p.ingredients||"")+'" data-mfg="'+esc(p.manufacturing_date||"")+'" data-expiry="'+esc(p.expiry_date||"")+'">'+esc(p.name)+'</option>').join("");
sel.onchange=async()=>{
$("#cicPassResult").innerHTML="";
const id=sel.value;if(!id)return;
const {data:p}=await db.from("product_passports").select("*").eq("product_id",id).maybeSingle();
const opt=sel.options[sel.selectedIndex];
$("#cicPassBatch").value=p?.batch_code||opt.dataset.batch||"";
$("#cicPassIngredients").value=(p?.ingredients||[]).join(", ")||opt.dataset.ingredients||"";
$("#cicPassOrigin").value=p?.origin||"";
$("#cicPassMfg").value=p?.manufacturing_date||opt.dataset.mfg||""; $("#cicPassBest").value=p?.best_before||opt.dataset.expiry||"";
$("#cicPassStorage").value=p?.storage_instructions||"";
$("#cicPassAllergens").value=(p?.allergen_information||[]).join(", ")||"";
$("#cicPassStory").value=p?.public_story||"";
$("#cicPassPublished").checked=!!p?.published;
};
}
function splitList(v){return v.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean)}
async function save(e){
e.preventDefault();if(!await owner()){message("Owner session expired. Please sign in again.");return}
const id=$("#cicPassProduct").value,ingredients=$("#cicPassIngredients").value.trim();
if(!id||!ingredients){message("Choose a product and enter its verified ingredients.");return}
const {data:product,error:productError}=await db.from("products").select("name,is_active").eq("id",id).maybeSingle();
if(productError||!product){message("Could not verify the selected product. Refresh and try again.");return}
if($("#cicPassPublished").checked&&product.is_active!==true){message("This product is hidden from the shop. Activate it in Owner Products before publishing its QR passport.");return}
const mfg=$("#cicPassMfg").value,best=$("#cicPassBest").value;
if(mfg&&best&&mfg>best){message("Manufacturing date cannot be later than the expiry / best-before date.");return}
const btn=$("#cicPassSave");btn.disabled=true;btn.textContent="Saving…";
const {data:existing,error:readError}=await db.from("product_passports").select("public_slug").eq("product_id",id).maybeSingle();
if(readError){btn.disabled=false;btn.textContent="Save product passport";message("Could not check the existing passport. Please try again.");return}
const slug=existing?.public_slug||("cic-"+id.toLowerCase());
const row={product_id:id,public_slug:slug,manufacturing_date:$("#cicPassMfg").value||null,ingredients:splitList(ingredients),allergen_information:splitList($("#cicPassAllergens").value),origin:$("#cicPassOrigin").value.trim()||null,batch_code:$("#cicPassBatch").value.trim()||null,best_before:$("#cicPassBest").value||null,storage_instructions:$("#cicPassStorage").value.trim()||null,public_story:$("#cicPassStory").value.trim()||null,published:$("#cicPassPublished").checked,updated_at:new Date().toISOString()};
const {error}=await db.from("product_passports").upsert(row,{onConflict:"product_id"});
btn.disabled=false;btn.textContent="Save product passport";
if(error){message("Could not save passport. Confirm the latest store migration and owner permissions are active.");return}
const url=location.origin+"/passport.html?slug="+encodeURIComponent(slug);
const result=$("#cicPassResult");
result.innerHTML='<div class="msg">'+(row.published?"Passport saved and published.":"Passport saved as unpublished; public QR page will not reveal it yet.")+'<br><a href="'+esc(url)+'" target="_blank" rel="noopener">Open product passport</a><br><label>QR destination</label><input readonly value="'+esc(url)+'"><button type="button" id="cicPassCopy">Copy QR destination</button>'+(row.published?'<p><img alt="QR code for this product passport" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='+encodeURIComponent(url)+'"></p><button type="button" id="cicPassPrint">Print product QR label</button><p>Print label includes CRAVE ISLAND CEYLON with the QR code underneath.</p>':"")+'</div>';
$("#cicPassCopy").onclick=async()=>{try{await navigator.clipboard.writeText(url);message("QR destination copied.")}catch(e){message("Select and copy the QR destination from the field.")}};
const printButton=$("#cicPassPrint");
if(printButton)printButton.onclick=()=>{
const productName=$("#cicPassProduct").selectedOptions[0]?.textContent||"Product";
const batch=$("#cicPassBatch").value.trim();
const mfg=$("#cicPassMfg").value;
const best=$("#cicPassBest").value;
const qr="https://api.qrserver.com/v1/create-qr-code/?size=360x360&data="+encodeURIComponent(url);
const win=window.open("","_blank","width=480,height=640");
if(!win){message("Allow pop-ups to print the QR label.");return}
const safe=v=>String(v||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
win.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRAVE ISLAND CEYLON QR Label</title><style>@page{size:50mm 70mm;margin:3mm}*{box-sizing:border-box}body{margin:0;width:44mm;min-height:64mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;color:#2C1A14;font-family:Arial,sans-serif;padding:2mm}.brand{font:700 12pt Georgia,serif;letter-spacing:.4px;border-bottom:1px solid #D4AF37;padding-bottom:2mm;width:100%}.tag{font-size:6.5pt;letter-spacing:1px;margin-top:1.5mm}.name{font-size:9pt;font-weight:700;margin:3mm 0 1mm;overflow-wrap:anywhere}.qr{width:34mm;height:34mm;object-fit:contain;margin:1mm auto}.batch{font-size:7pt;margin-top:1mm}.note{font-size:6pt;margin-top:2mm;color:#65554b}@media screen{body{margin:15px auto;border:1px dashed #bbb;padding:10px;width:44mm}}</style></head><body><div class="brand">CRAVE ISLAND CEYLON</div><div class="tag">PRODUCT PASSPORT</div><div class="name">'+safe(productName)+'</div><img class="qr" alt="Product passport QR code" src="'+safe(qr)+'"><div class="batch">'+(batch?"Batch / Lot: "+safe(batch):"Scan to verify product details")+'</div><div class="batch">'+(mfg?"MFG: "+safe(mfg):"")+(best?" · Best before: "+safe(best):"")+'</div><div class="note">Scan for verified ingredients and product information</div><script>const q=document.querySelector(".qr");q.onload=()=>setTimeout(()=>window.print(),250);q.onerror=()=>document.body.insertAdjacentHTML("beforeend","<p>QR image could not load. Close and try again.</p>");<\/script></body></html>');
win.document.close();
};

$("#cicPassCopy").onclick=async()=>{try{await navigator.clipboard.writeText(url);message("QR destination copied.")}catch(e){message("Select and copy the QR destination from the field.")}};
message("Passport saved successfully.");
}
function init(){if(!window.CIC_SUPABASE_CONFIG?.anonKey||!window.CIC_SUPABASE?.client)return;mount();const update=async()=>{const b=$("#cicPassportButton");if(b)b.hidden=!(await owner())};update();db=window.CIC_SUPABASE.client;db.auth.onAuthStateChange(()=>setTimeout(update,200))}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(init,500));else setTimeout(init,500);
})();