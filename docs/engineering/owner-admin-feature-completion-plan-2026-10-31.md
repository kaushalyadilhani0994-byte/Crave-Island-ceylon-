# CRAVE ISLAND CEYLON — Owner Admin Feature Completion Plan
**Review date:** 2026-10-31  
**Preservation rule:** extend the existing owner Admin capabilities without replacing, redesigning, hiding, or changing the current Admin layout or OTP flow.

## Confirmed live Admin foundations
- Existing owner authentication checks both the approved owner email and an approved `staff_profiles` row. The current OTP gate and four-card owner dashboard are preserved.
- Owner-only Catalogue, Orders, and QR Passport panels are separately mounted and check approved owner status before showing their entry points.
- Owner Orders reads up to 100 newest order headers and item snapshots. Status changes are sent to the JWT-protected `update-order-status` Edge Function; order totals and payment state are not editable from the browser.
- Owner Catalogue can create categories and hidden product drafts, list products, and deactivate products. The product editor already captures core traceability fields including ingredients, allergens, batch, manufacturing/best-before dates, storage location, stock and low-stock threshold.
- Owner QR Passport publishing is separate from product creation. The public passport page is read-only and only serves published passports for active products.
- The existing alert summary reads open `admin_alerts` and displays an owner-only badge/list. Daily Telegram report cron is active; latest run received provider success acknowledgement.

## Verified missing or incomplete Admin operations
### A. Team and role management
- Live `staff_profiles` schema has `id`, `display_name`, `role`, `approved`, `permissions`, and `email`.
- Deployed `owner-invite-team-member` v1 only invites one of the roles supervisor/staff/media/accounts/star_club and creates the profile as `approved=false`, `permissions={}`.
- No complete owner UI or verified backend actions were found for reviewing pending invitations, approving/rejecting a member, assigning/revoking module permissions, suspending access, or auditing role changes.
- **Required safe extension:** a compact Team Management section added within the existing owner Admin experience (not a replacement for it), with pending/approved/suspended state, role selection, granular permissions, last-updated/audit information, and confirmation for privilege changes.
- **Backend requirement:** add owner-authenticated Edge Functions/RPCs for approve, permission update, and revoke/suspend. Each must re-check the caller's approved owner profile server-side, validate allowed roles/actions, prevent changing/demoting the final owner, and write an audit event. Never allow browser code to update privileged staff rows directly.
- Keep the Main Admin/owner role separate from inviteable team roles. Do not allow a team invite to create an owner.
- Do not enable this UI until the backend is reviewed and tested with two isolated accounts.

### B. Inventory and expiry management
- Products table has stock quantity, low-stock threshold, tracking flag, expiry date, manufacturing date and storage location.
- Deployed `update-product-inventory` v2 has a date-regex defect candidate: the source regex contains an extra escaped backslash and rejects valid ISO date strings. It is not currently referenced by a frontend callsite found in repository search.
- A corrected review-only source copy now exists at `supabase/functions/update-product-inventory/index.ts`. Its date validator uses strict YYYY-MM-DD plus calendar round-trip validation.
- Local logic cases checked: valid ordinary date and leap day accepted; invalid leap day, impossible month/day, wrong format, empty and null are rejected by the helper (null is handled separately by the endpoint).
- This copy is not deployed. Before wiring it to an Admin control, add endpoint tests for owner, approved inventory staff, unapproved staff, wrong permission, invalid UUID, negative/fractional/out-of-range stock, valid/null/invalid expiry dates, missing product and database error.
- Build the inventory controls as a separate extension in the existing catalogue panel only after tests pass. Preserve existing add-product workflow.

### C. Product/category editing and media
- Current category workflow supports creating a category/subcategory; full edit/reorder/activate/deactivate controls need an explicit owner-safe workflow and collision checks.
- Product list supports deactivation; full editing of existing products and image upload to a private/publicly scoped Storage bucket are not yet verified.
- Before adding edit controls, define how product name/category changes affect existing passport records and customer order item snapshots. Never rewrite historical order snapshots.
- Before image upload, inspect bucket policies, accepted MIME types, maximum file size, random object naming, cache behaviour and deletion/replace rules. Do not use unrestricted arbitrary URL uploads as a substitute for verified media handling.
- Product and category changes should show a clear before/after confirmation and preserve the current draft → owner review → activation → passport publication process.

### D. Owner alerts and daily operations
- Existing open-alert badge/list and Telegram dispatcher are present. The table has dedupe key, severity, status, entity references, acknowledged time, notification attempt/success timestamps and error fields.
- Improve the existing alert experience by surfacing alert delivery failures and stale/unacknowledged critical alerts to the owner. Do not create duplicate alert rows; preserve dedupe semantics.
- Add actionable alert filters (open/acknowledged/resolved, severity/type) only after confirming existing status transitions and server-side permission rules.
- Expiry lead-time policy and stock warning thresholds must be owner-defined; do not hard-code a guessed expiry window.
- Daily owner report should clearly distinguish zero orders, zero active products, open alerts and notification-delivery failures. Never include unnecessary customer PII in the daily summary.

## Safe implementation order
1. Fix and test the inventory endpoint in review only; do not deploy until its real frontend callsite and schema contract are confirmed.
2. Design and implement secure staff approval/permission endpoints plus audit trail in an isolated environment.
3. Add the compact Team Management capability inside the existing Admin without altering its layout/navigation/auth entry flow.
4. Complete product/category edit and media upload after Storage policies and passport/order-history effects are understood.
5. Extend owner alert acknowledgement and delivery-failure visibility.
6. Test every role with separate accounts: owner, supervisor, staff, media, accounts, and unapproved invite. Verify both UI visibility and direct API denial.
7. Merge/deploy only after explicit owner approval and a tested preview. Keep production URL and current Admin entry/auth unchanged.

## Explicit non-actions
- No live staff invitations, approvals, permission changes or role updates.
- No live inventory or product/category edits.
- No database migration or SQL write.
- No Admin layout, OTP, auth, navigation or production URL changes.
- No production deployment.
