/* CRAVE ISLAND CEYLON — single owner workspace entry point.
 * Routes the Control Room to the Supabase-backed catalogue, orders and passports.
 */
(function () {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  let mounted = false;
  function addStyle() {
    if ($("#cic-owner-workspace-style")) return;
    const style = document.createElement("style");
    style.id = "cic-owner-workspace-style";
    style.textContent = `
      #cicOwnerWorkspace{margin:12px 0 18px;padding:18px;border:1px solid #D4AF37;border-radius:14px;background:linear-gradient(135deg,#fffaf0,#f2e6d4);color:#2C1A14}
      #cicOwnerWorkspace h3{margin:0 0 5px;font:normal 23px Georgia,serif}
      #cicOwnerWorkspace p{margin:0 0 14px;font:12px/1.5 system-ui,sans-serif;color:#75645a}
      #cicOwnerWorkspace .cic-live-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      #cicOwnerWorkspace button{min-height:58px;border:1px solid #D4AF37;border-radius:10px;background:#2C1A14;color:#FFF8E7;padding:11px;text-align:left;font:600 12px/1.4 system-ui,sans-serif;cursor:pointer}
      #cicOwnerWorkspace button span{display:block;opacity:.78;font-size:10px;font-weight:400;margin-top:3px}
      #cicOwnerWorkspace .cic-owner-workspace-status{margin-top:11px;font:11px/1.5 system-ui,sans-serif;color:#75645a}
      #cicOwnerOrdersButton,#cicOwnerCatalogueButton,#cicPassportButton{display:none!important}
      @media(max-width:650px){#cicOwnerWorkspace{padding:13px}#cicOwnerWorkspace .cic-live-actions{grid-template-columns:1fr}}
      #admin-overview>.control-grid,#admin-overview>.automation,#admin-overview>.health-bar{display:none!important}
      #admin-catalog .owner-image-panel{display:none!important}
    `;
    document.head.appendChild(style);
  }
  function openTool(modalId, buttonId, label) {
    const trigger = document.getElementById(buttonId);
    const modal = document.getElementById(modalId);
    if (trigger) { trigger.click(); return; }
    const status = $("#cicOwnerWorkspaceStatus");
    if (status) status.textContent = label + " is still loading. Wait a moment and try again.";
    if (modal) modal.style.display = "flex";
  }
  function mount() {
    if (mounted) return;
    const control = $("#controlRoomModal"), overview = $("#admin-overview", control);
    if (!control || !overview) return;
    addStyle();
    const panel = document.createElement("section");
    panel.id = "cicOwnerWorkspace";
    panel.innerHTML = `<h3>CRAVE Control Room</h3>
      <p>One place to manage your live store using your approved owner account.</p>
      <div class="cic-live-actions">
        <button type="button" data-open-live="catalogue">Catalogue &amp; Products<span>Collections, prices, drafts and publishing</span></button>
        <button type="button" data-open-live="orders">Orders &amp; Customers<span>Real orders and secure status updates</span></button>
        <button type="button" data-open-live="passport">QR Product Passports<span>Verified ingredients and public QR pages</span></button>
      </div>
      <div class="cic-owner-workspace-status" id="cicOwnerWorkspaceStatus" role="status">New products are saved as drafts. Publish only after verifying the product and label details.</div>`;
    overview.prepend(panel);
    panel.querySelector('[data-open-live="catalogue"]').addEventListener("click", () => openTool("cicOwnerCatalogue","cicOwnerCatalogueButton","Catalogue"));
    panel.querySelector('[data-open-live="orders"]').addEventListener("click", () => openTool("cicOwnerOrdersModal","cicOwnerOrdersButton","Orders"));
    panel.querySelector('[data-open-live="passport"]').addEventListener("click", () => openTool("cicPassportAdmin","cicPassportButton","QR Passports"));
    mounted = true;
  }
  function start() {
    mount();
    if (mounted) return;
    const observer = new MutationObserver(() => { mount(); if (mounted) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),15000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();