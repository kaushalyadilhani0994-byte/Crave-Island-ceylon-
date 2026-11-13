/* CRAVE ISLAND CEYLON — approved-owner product passport publishing */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let db, passportLoadState="idle", passportSaving=false, ownerProducts=[];
let qrLibraryPromise=null;
function ensureQrLibrary(){
 if(window.qrcode)return Promise.resolve();
 if(!qrLibraryPromise)qrLibraryPromise=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src="/vendor/qrcode-generator.js";
  script.async=true;
  script.onload=()=>window.qrcode?resolve():reject(new Error("Local QR library did not initialise."));
  script.onerror=()=>reject(new Error("Local QR library could not be loaded."));
  document.head.appendChild(script);
 });
 return qrLibraryPromise;
}
function makeQrDataUrl(value,cellSize){
 const qr=window.qrcode(0,"H");
 qr.addData(String(value),"Byte");
 qr.make();
 return qr.createDataURL(cellSize||8,2);
}

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
const b=document.createElement("button");b.id="cicPassportButton";b.hidden=true;b.textContent="Owner · QR Passports";b.onclick=async()=>{if(passportSaving){message("Please wait until the current passport save finishes.");return}const p=$("#cicPassportAdmin");p.style.display="flex";await loadProducts()};document.body.appendChild(b);
const modal=document.createElement("div");modal.id="cicPassportAdmin";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");
modal.innerHTML='<section class="panel"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><h2 style="margin:0">Product QR Passport</h2><p style="margin:5px 0;color:#79685d">Publish verified product details for QR scans.</p></div><button id="cicPassportClose" type="button">Close ✕</button></div><div id="cicPassportMsg" class="msg" role="status">Choose a product and enter verified pack information.</div><form id="cicPassportForm"><label for="cicPassProduct">Product *</label><select id="cicPassProduct" required><option value="">Loading products…</option></select><div class="grid"><div><label for="cicPassOrigin">Origin</label><input id="cicPassOrigin" maxlength="180" placeholder="Only enter a verified origin"></div><div><label for="cicPassBatch">Batch / lot</label><input id="cicPassBatch" maxlength="100"></div><div><label for="cicPassMfg">Manufacturing date</label><input id="cicPassMfg" type="date"></div><div><label for="cicPassBest">Best before / expiry</label><input id="cicPassBest" type="date"></div><div><label for="cicPassNetContent">Net content / pack size</label><input id="cicPassNetContent" maxlength="80" placeholder="e.g. 100 g, 250 ml"></div><div><label for="cicPassStorage">Storage instructions</label><input id="cicPassStorage" maxlength="500"></div></div><label for="cicPassIngredients">Ingredients *</label><textarea id="cicPassIngredients" maxlength="5000" required placeholder="Exact verified ingredient list"></textarea><label for="cicPassAllergens">Allergen information</label><textarea id="cicPassAllergens" maxlength="2000" placeholder="Declared allergens and cross-contact notes, if verified"></textarea><label for="cicPassStory">Product story</label><textarea id="cicPassStory" maxlength="2000" placeholder="Accurate product story; avoid unverified health claims"></textarea><label><input id="cicPassPublished" type="checkbox" style="width:auto"> Publish publicly so the QR page can be viewed</label><button id="cicPassSave" type="submit">Save product passport</button></form><div id="cicPassResult"></div></section>';
document.body.appendChild(modal);
$("#cicPassportClose").onclick=()=>modal.style.display="none";
$("#cicPassportForm").addEventListener("submit",save);
}
function message(t){const e=$("#cicPassportMsg");if(e)e.textContent=t}
async function loadProducts(){
passportLoadState="idle";
const initialSaveButton=$("#cicPassSave");
if(initialSaveButton)initialSaveButton.disabled=true;
if(!await owner()){message("Sign in with the approved owner account to manage product passports.");return}
const {data,error}=await db.rpc("owner_list_products");
if(error){message("Could not load the secure owner product list. Check owner access and try again.");return}
ownerProducts=(data||[]).map(row=>typeof row==="string"?JSON.parse(row):row).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
const sel=$("#cicPassProduct");
const saveButton=$("#cicPassSave");
passportLoadState="idle";
if(saveButton)saveButton.disabled=true;
sel.innerHTML='<option value="">Choose a product</option>'+(ownerProducts||[]).map(p=>'<option value="'+esc(p.id)+'" data-description="'+esc(p.description||"")+'" data-batch="'+esc(p.batch_number||"")+'" data-ingredients="'+esc(p.ingredients||"")+'" data-mfg="'+esc(p.manufacturing_date||"")+'" data-expiry="'+esc(p.expiry_date||"")+'">'+esc(p.name)+'</option>').join("");
sel.onchange=async()=>{
$("#cicPassResult").innerHTML="";
const id=sel.value;
passportLoadState=id?"loading":"idle";
if(saveButton)saveButton.disabled=!!id;
if(!id){message("Choose a product and enter verified pack information.");return}
message("Loading the saved passport details before editing…");
const opt=sel.options[sel.selectedIndex];
const {data:p,error:passportError}=await db.from("product_passports").select("*").eq("product_id",id).maybeSingle();
if(sel.value!==id)return;
if(passportError){
passportLoadState="error";
if(saveButton)saveButton.disabled=true;
message("Could not load the existing passport safely. Your saved details are protected; refresh and try again.");
return;
}
$("#cicPassBatch").value=p?.batch_code||opt.dataset.batch||"";
$("#cicPassIngredients").value=(p?.ingredients||[]).join(", ")||opt.dataset.ingredients||"";
$("#cicPassOrigin").value=p?.origin||"";
$("#cicPassMfg").value=p?.manufacturing_date||opt.dataset.mfg||"";
$("#cicPassBest").value=p?.best_before||opt.dataset.expiry||"";
$("#cicPassNetContent").value=p?.net_content||"";
$("#cicPassStorage").value=p?.storage_instructions||"";
$("#cicPassAllergens").value=(p?.allergen_information||[]).join(", ")||"";
$("#cicPassStory").value=p?.public_story||opt.dataset.description||"";
$("#cicPassPublished").checked=!!p?.published;
passportLoadState="loaded";
if(saveButton)saveButton.disabled=false;
message(p?"Existing passport loaded. Check verified details before saving.":"No passport exists yet. Enter verified details to create one.");
await showExistingQr(ownerProducts.find(item=>String(item.id)===String(id)),p);
};
}
function splitList(v){return v.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean)}
async function showExistingQr(product,passport){
 const result=$("#cicPassResult");if(!result)return;
 result.innerHTML="";
 const stored=String(product?.qr_code||"").trim();
 const slug=String(passport?.public_slug||"").trim();
 let url=/^https:\/\//i.test(stored)?stored:(slug?new URL("/passport.html?slug="+encodeURIComponent(slug),location.origin).href:"");
 if(!url){
  if(stored)result.innerHTML="<div class=\"msg\"><b>Saved QR reference</b><br>"+esc(stored)+"<br><small>This older value is a reference code, not a complete scan link. It has been preserved.</small></div>";
  return;
 }
 const isPublished=passport?.published===true;
 let qrImage="";
 try{await ensureQrLibrary();qrImage=makeQrDataUrl(url,7);}catch(error){result.innerHTML="<div class=\"msg\">Saved QR destination found, but the local QR image could not load. The link is preserved below.</div>";}
 result.innerHTML='<div class="msg"><b>Saved product QR</b><br>'+(isPublished?"Published passport":"Saved but not published — scans will not reveal the passport until it is published")+'<br><a href="'+esc(url)+'" target="_blank" rel="noopener">Open product passport</a><br><label>QR destination</label><input id="cicPassExistingUrl" readonly value="'+esc(url)+'"><button type="button" id="cicPassExistingCopy">Copy QR destination</button>'+(qrImage?'<p><img alt="Saved QR code for this product" src="'+esc(qrImage)+'"></p><button type="button" id="cicPassExistingPrint">Print product QR label</button><p>QR generated locally on this device.</p>':"")+'</div>';
 $("#cicPassExistingCopy").onclick=async()=>{try{await navigator.clipboard.writeText(url);message("Saved QR destination copied.")}catch(error){const field=$("#cicPassExistingUrl");field.focus();field.select();message("Select and copy the saved QR destination.")}};
 const print=$("#cicPassExistingPrint");if(print)print.onclick=()=>{
  const win=window.open("","_blank","width=480,height=640");if(!win){message("Allow pop-ups to print the QR label.");return}
  const safe=v=>String(v||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>CRAVE ISLAND CEYLON QR Label</title><style>@page{size:50mm 70mm;margin:3mm}body{width:44mm;margin:0 auto;text-align:center;font-family:Arial,sans-serif;color:#2C1A14}.brand{font:700 12pt Georgia,serif;border-bottom:1px solid #D4AF37;padding:2mm}.name{font-size:9pt;font-weight:bold;margin:3mm 0}.qr{width:34mm;height:34mm}.note{font-size:6pt;margin-top:2mm}</style></head><body><div class="brand">CRAVE ISLAND CEYLON</div><div class="name">'+safe(product?.name||"Product")+'</div><img class="qr" src="'+safe(qrImage)+'"><div class="note">Scan for product passport</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>');win.document.close();
 };
}
async function save(e){
e.preventDefault();
if(passportSaving)return;
passportSaving=true;
const form=$("#cicPassportForm");
const controls=Array.from(form.elements).map(el=>({el,disabled:el.disabled}));
controls.forEach(({el})=>{el.disabled=true;});
try{await savePassport(e)}finally{
controls.forEach(({el,disabled})=>{el.disabled=disabled;});
passportSaving=false;
}
}
async function savePassport(e){
e.preventDefault();if(!await owner()){message("Owner session expired. Please sign in again.");return}
const id=$("#cicPassProduct").value,ingredients=$("#cicPassIngredients").value.trim();
if(!id||passportLoadState!=="loaded"){message("Wait until the selected product's saved passport details have loaded successfully.");return}
if(!ingredients){message("Enter the verified ingredient list.");return}
const product=ownerProducts.find(item=>String(item.id)===String(id));
if(!product){message("Could not verify the selected product. Refresh and try again.");return}
if($("#cicPassPublished").checked&&product.is_active!==true){message("This product is hidden from the shop. Activate it in Owner Products before publishing its QR passport.");return}
const mfg=$("#cicPassMfg").value,best=$("#cicPassBest").value;
if(mfg&&best&&mfg>best){message("Manufacturing date cannot be later than the expiry / best-before date.");return}
const btn=$("#cicPassSave");
btn.textContent="Saving…";
const row={
manufacturing_date:mfg||null,
ingredients:splitList(ingredients),
allergen_information:splitList($("#cicPassAllergens").value),
origin:$("#cicPassOrigin").value.trim()||null,
batch_code:$("#cicPassBatch").value.trim()||null,
best_before:best||null,
net_content:$("#cicPassNetContent").value.trim()||null,
storage_instructions:$("#cicPassStorage").value.trim()||null,
public_story:$("#cicPassStory").value.trim()||null,
published:$("#cicPassPublished").checked
};
if(row.published){try{await ensureQrLibrary()}catch(qrError){message("The local QR generator could not load. No passport changes were saved; refresh and retry.");btn.textContent="Save product passport";return}}
let data,error;
try {
const response=await db.rpc("owner_update_product_passport",{
p_product_id:id,
p_payload:row,
p_site_origin:location.origin
});
data=response.data;error=response.error;
} catch (requestError) {
message("The passport save response was interrupted. Your details are still here; press Save again to safely retry.");
return;
} finally {
btn.textContent="Save product passport";
}
if(error){
const raw=String(error.message||"").toLowerCase();
const known=[
["approved_owner_required","Only the approved owner account can save a product passport."],
["activate_product_before_publishing_passport","Activate this product in Owner Products before publishing its public QR passport."],
["manufacturing_date_cannot_be_in_future","The manufacturing date cannot be in the future."],
["invalid_product_date_range","The manufacturing date must be before the best-before date."],
["invalid_site_origin","The secure app address could not be verified. Reopen the official app and retry."],
["expired_passport_cannot_be_published","A product with a past best-before date cannot be published. Check the verified date before publishing."],
["passport_text_field_too_long","One or more passport fields are too long. Shorten the text and save again."]
];
const match=known.find(([code])=>raw.includes(code));
message(match?match[1]:"Could not save the passport and QR together. Your entered details are still here; check owner access and retry.");
return;
}
const saved=Array.isArray(data)?data[0]:data;
if(!saved||!saved.qr_url){message("The server did not confirm the passport and QR save. Please retry.");return}
const url=saved.qr_url;
const qrImage=row.published?makeQrDataUrl(url,7):"";
const result=$("#cicPassResult");
result.innerHTML='<div class="msg">'+(row.published?"Passport saved and published.":"Passport saved as unpublished; public QR page will not reveal it yet.")+'<br><a href="'+esc(url)+'" target="_blank" rel="noopener">Open product passport</a><br><label>QR destination</label><input readonly value="'+esc(url)+'"><button type="button" id="cicPassCopy">Copy QR destination</button>'+(row.published?'<p><img alt="QR code for this product passport" src="'+esc(qrImage)+'"></p><button type="button" id="cicPassPrint">Print product QR label</button><p>QR generated on this device. Product URL is not sent to an external QR service.</p>':"")+'</div>';
$("#cicPassCopy").onclick=async()=>{try{await navigator.clipboard.writeText(url);message("QR destination copied.")}catch(e){message("Select and copy the QR destination from the field.")}};
const printButton=$("#cicPassPrint");
if(printButton)printButton.onclick=()=>{
const productName=product.name||"Product";
const batch=row.batch_code||"";
const netContent=row.net_content||"";
const mfg=row.manufacturing_date||"";
const best=row.best_before||"";
let qr;
try{qr=makeQrDataUrl(url,10)}catch(qrError){message("Could not generate the local QR image. Refresh and try again.");return}
const win=window.open("","_blank","width=480,height=640");
if(!win){message("Allow pop-ups to print the QR label.");return}
try{win.opener=null;}catch(_){}
const safe=v=>String(v||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
win.document.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRAVE ISLAND CEYLON QR Label</title><style>@page{size:50mm 70mm;margin:3mm}*{box-sizing:border-box}body{margin:0;width:44mm;min-height:64mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;color:#2C1A14;font-family:Arial,sans-serif;padding:2mm}.brand{font:700 12pt Georgia,serif;letter-spacing:.4px;border-bottom:1px solid #D4AF37;padding-bottom:2mm;width:100%}.tag{font-size:6.5pt;letter-spacing:1px;margin-top:1.5mm}.name{font-size:9pt;font-weight:700;margin:3mm 0 1mm;overflow-wrap:anywhere}.qr{width:34mm;height:34mm;object-fit:contain;margin:1mm auto}.batch{font-size:7pt;margin-top:1mm}.note{font-size:6pt;margin-top:2mm;color:#65554b}@media screen{body{margin:15px auto;border:1px dashed #bbb;padding:10px;width:44mm}}</style></head><body><div class="brand">CRAVE ISLAND CEYLON</div><div class="tag">PRODUCT PASSPORT</div><div class="name">'+safe(productName)+'</div><img class="qr" alt="Product passport QR code" src="'+safe(qr)+'"><div class="batch">'+(batch?"Batch / Lot: "+safe(batch):"Scan to verify product details")+'</div><div class="batch">'+(netContent?"Net: "+safe(netContent):"")+'</div><div class="batch">'+(mfg?"MFG: "+safe(mfg):"")+(best?" · Best before: "+safe(best):"")+'</div><div class="note">Scan for verified ingredients and product information</div><script>const q=document.querySelector(".qr");let printed=false;const printReady=()=>{if(printed)return;printed=true;window.focus();setTimeout(()=>window.print(),250)};const printFailed=()=>{document.body.insertAdjacentHTML("beforeend","<p>QR image could not load. Close this window and retry before printing.</p>")};if(q.complete){if(q.naturalWidth>0)printReady();else printFailed()}else{q.addEventListener("load",printReady,{once:true});q.addEventListener("error",printFailed,{once:true})}<\/script></body></html>');
win.document.close();
};

message("Passport saved successfully.");
}
function init(){
 const config=window.CIC_SUPABASE_CONFIG;
 const client=window.CIC_SUPABASE&&window.CIC_SUPABASE.client;
 if(!config?.anonKey||!client)return false;
 db=client;
 mount();
 const update=async()=>{
  const button=$("#cicPassportButton");
  if(!button)return false;
  try{button.hidden=!(await owner());return true}
  catch(error){console.warn("[CRAVE QR] Owner visibility check failed:",error);button.hidden=true;return false}
 };
 // Supabase may still be restoring its persisted OTP session when this module loads.
 // Recheck after INITIAL_SESSION and for a short bounded window; never grant access locally.
 update();
 db.auth.onAuthStateChange(()=>{setTimeout(update,0);setTimeout(update,350)});
 [300,900,1800,3500,6000].forEach(delay=>setTimeout(update,delay));
 return true;
}
function boot(attempt){
 if(init())return;
 if(attempt<20)setTimeout(()=>boot(attempt+1),250);
 else console.warn("[CRAVE QR] Supabase client was not ready; QR module could not initialise.");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>boot(0),100),{once:true});
else setTimeout(()=>boot(0),100);
})();