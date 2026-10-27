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
      /* Customer navigation: no Admin entry. Keep six customer actions spacious and readable.
         The original Control Room itself is deliberately untouched. */
      .bottom{grid-template-columns:repeat(6,minmax(0,1fr))!important}
      .bottom>.nav:last-child{display:none!important}
      .bottom>.nav{padding:10px 3px 8px;gap:5px;font-size:10px;line-height:1.15}
      .bottom>.nav svg{width:21px;height:21px}
      .bottom>.nav .nav-label{font-size:10px;line-height:1.15}
      .bottom>.nav .nav-sub{font-size:8px;line-height:1.15}
      @media(max-width:650px){#cicOwnerWorkspace{padding:13px}#cicOwnerWorkspace .cic-live-actions{grid-template-columns:1fr}}
      @media(max-width:390px){.bottom>.nav{padding:8px 1px 7px}.bottom>.nav svg{width:19px;height:19px}.bottom>.nav .nav-label{font-size:9px}.bottom>.nav .nav-sub{font-size:7px}}
      /* Preserve the original V18 Control Room navigation and panels.
         The quick links are shortcuts only; they must not replace existing owner tools. */
      #controlRoomModal .health-bar{border:1px solid #D4AF37;border-radius:10px;padding:10px;background:#fffaf0}
      #controlRoomModal .health-note{line-height:1.55}
      #controlRoomModal #admin-overview .control-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      @media(max-width:420px){#controlRoomModal #admin-overview .control-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }
  async function openTool(modalId, buttonId, label) {
    const status = $("#cicOwnerWorkspaceStatus");
    if (status) status.textContent = "Opening " + label + "…";
    // Admin modules mount asynchronously. Do not expose an uninitialized modal
    // when its trigger (which performs owner checks and loads data) is not ready.
    for (let attempt = 0; attempt < 60; attempt++) {
      const trigger = document.getElementById(buttonId);
      const modal = document.getElementById(modalId);
      // Wait until both the secure trigger and its actual live modal are mounted.
      if (trigger && modal) {
        trigger.click();
        await new Promise(resolve => window.setTimeout(resolve, 180));
        let isOpen = modal.style.display === "flex" ||
          modal.getAttribute("aria-hidden") === "false" ||
          modal.classList.contains("open");
        // The original V18 owner buttons are intentionally hidden to avoid duplicate
        // floating shortcuts on mobile. A programmatic click can therefore fail on
        // some mobile browsers. The workspace is already inside the approved-owner
        // Control Room, so open the same live module directly as a safe fallback.
        if (!isOpen) {
          modal.style.display = "flex";
          modal.setAttribute("aria-hidden", "false");
          await new Promise(resolve => window.setTimeout(resolve, 100));
          isOpen = modal.style.display === "flex" ||
            modal.getAttribute("aria-hidden") === "false" ||
            modal.classList.contains("open");
        }
        if (isOpen) {
          if (modalId === "cicOwnerOrdersModal" && typeof window.CIC_REFRESH_LIVE_ORDERS === "function") {
            window.CIC_REFRESH_LIVE_ORDERS();
          }
          if (status) status.textContent = label + " opened. Live data is loading.";
          return;
        }
        // Do not claim success if the module failed to mount.
        if (status) status.textContent = label + " is not ready yet. Close Control Room, wait a few seconds, and try again.";
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
    if (status) status.textContent = label + " could not load yet. Close Control Room, wait a few seconds, and try again.";
  }
  function mount() {
    if (mounted) return;
    const control = $("#controlRoomModal");
    if (!control) return;
    const overview = $("#admin-overview", control);
    if (!overview) return;
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
    // V18 modules can render after auth on slower mobile connections.
    window.setTimeout(()=>observer.disconnect(),60000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();