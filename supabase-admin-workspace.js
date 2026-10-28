/* CRAVE ISLAND CEYLON — preserve the original V18 Control Room.
 * Do not inject a second workspace or replace the original admin layout.
 * Owner-only access is still enforced by supabase-admin-auth.js and Supabase RLS.
 */
(function () {
  "use strict";
  function preserveOriginalControlRoom() {
    // Remove the duplicate panel introduced by the newer workspace overlay.
    const duplicate = document.getElementById("cicOwnerWorkspace");
    if (duplicate) duplicate.remove();

    // Remove only the overlay's injected stylesheet. The original V18 admin
    // navigation, panels, and owner-auth visibility guard remain untouched.
    const overlayStyle = document.getElementById("cic-owner-workspace-style");
    if (overlayStyle) overlayStyle.remove();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", preserveOriginalControlRoom, { once: true });
  } else {
    preserveOriginalControlRoom();
  }
})();
