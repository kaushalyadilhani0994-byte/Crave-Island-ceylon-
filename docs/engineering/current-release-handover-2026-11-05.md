# CRAVE ISLAND CEYLON — Current Release Handover
Reviewed: 2026-11-05

This note preserves the working state so the project can continue without asking the owner to repeat the history.

## Project and branch
- Repository: `kaushalyadilhani0994-byte/Crave-Island-ceylon-`
- Supabase project ref: `hkvrthigvrxbpaemxosy`
- Vercel project: `crave_island_ceylon_v18_supabase_integrated_build`
- Production URL: `https://craveislandceylonv18supabaseintegra.vercel.app`
- Active review: PR #17, “Restore secure owner access and repair product QR passport flow”.
- Review branch: `fix/admin-otp-modal-init-20261104`
- PR: https://github.com/kaushalyadilhani0994-byte/Crave-Island-ceylon-/pull/17

## Important owner-login finding
A read-only query of the live Supabase database confirms:
- Exactly one approved `staff_profiles` owner record exists and its `id` matches the existing Supabase Auth user for `kaushalyadilhani0994@gmail.com` (legacy alias 1).
- The `staff_profiles.email` field on that owner row is NULL; the identity link is by the shared Auth user UUID, not by the profile email field.
- The preferred primary email `kaushalyadilhanidissanayake@gmail.com` is NOT currently an Auth user in this project. The review-branch browser allowlist includes it, but allowlisting alone cannot create or verify that Auth identity.
- The linked legacy Auth identity is in the review-branch browser allowlist and was recently used to sign in (last sign-in recorded 2026-11-04).
- Therefore, the currently provisioned owner login is the legacy alias. Do not change Auth identity or owner profile automatically; adding the preferred email requires a verified Auth email-change / identity-linking process and the owner's explicit decision.

## Work verified on the review branch
- Original V18 Control Room path is preserved; no wholesale admin redesign.
- Owner access remains gated by email OTP/magic-link verification plus the approved `staff_profiles` owner row.
- Owner-only product listing uses `owner_list_products()` rather than exposing operational product columns to browser users.
- Product + passport + QR save is atomic and uses the current app origin (validated HTTPS/localhost), not a hard-coded production URL.
- Passport update RPC accepts the three arguments used by the browser client, including `p_site_origin`.
- Passport publication rejects inactive products and past best-before dates.
- Product and passport ingredients/allergens/batch/date/storage fields are synchronized.
- QR label printing waits for the QR image to load and checks `naturalWidth` before printing; the QR image still depends on the external `api.qrserver.com` service.
- Owner Orders and My Orders include a first-delivery timestamp and customer-scoped printable receipts.
- Latest JavaScript syntax checks passed for `supabase-admin-auth.js`, `supabase-admin-orders.js`, `supabase-admin-passports.js`, `supabase-admin-products.js`, and `supabase-store.js`. Inline scripts in `my-orders.html` and `passport.html` also passed. (A prior broader check also covered `supabase-checkout.js`.)
- Edge Function TypeScript files were fetched and basic brace-balance checked; a Deno/TypeScript build was not run.

## Live database findings — read-only audit
- Live database has not applied the five 2026-11-04 review migrations.
- Live `products` table still grants broad table-level SELECT to `anon` and `authenticated`, exposing operational fields such as stock and expiry. This is a confirmed security issue; staged migration 002 removes broad grants and grants only storefront-safe columns.
- Live `owner_list_products()` RPC is missing; the review branch adds it.
- Live `product_passports.net_content` is missing; migration 005 adds it.
- Live `store_orders.delivered_at` is missing; migration 004 adds it.
- Live `private.owner_product_save_requests` still has legacy `actor_user_id` and `qr_url` columns. Migration 001 contains a compatibility conversion to the new idempotency schema.
- The private request/audit tables have RLS disabled in live DB; migration 001 enables RLS and revokes browser grants.
- Supabase leaked-password protection is still disabled. This is an Auth dashboard setting and was not changed.
- Security advisor still reports cron extension policies and expected anonymous/public read policies; do not delete RLS policies blindly.
- Current live data: 60 categories (14 active), 1 product (0 active), 1 unpublished passport, 0 orders.

## Required migrations — review and apply in order only after approval
1. `supabase/migrations/202611040001_owner_list_products_rpc.sql`
2. `supabase/migrations/202611040002_restrict_public_product_columns.sql`
3. `supabase/migrations/202611040003_team_inventory_read_rpc.sql`
4. `supabase/migrations/202611040004_order_delivered_timestamp.sql`
5. `supabase/migrations/202611040005_sync_product_passport_fields.sql`
Also review the staged atomic product/passport save migration:
- `supabase/migrations/202611010001_atomic_owner_product_passport_save.sql`

## Still not completed / not tested
- No production migration has been applied.
- No PR merge or production deployment has been performed.
- No live Edge Function deployment has been performed from this review branch.
- No real-phone owner OTP/Admin navigation test, product save/publish test, physical QR scan/print test, customer checkout, receipt, or concurrency test has been completed.
- Separate role-specific OTP sign-in and workspaces for Supervisor, Staff, Media, and Accounts are not complete. Role cards must not grant access by selection alone.
- Public QR label generation still uses an external QR image service.
- Delivery fees, delivery areas, refund/cancellation/support policies and online payments remain owner decisions. COD is the only current payment method; delivery fee is currently zero.
- No placeholder product should be activated or published.

## Safety / continuation rules
1. Preserve the existing V18 storefront and Control Room; avoid unnecessary redesign.
2. Do not merge PR #17, apply production migrations, deploy Edge Functions, or deploy to production without the owner's explicit approval.
3. Do not repeatedly trigger Vercel builds while the daily deployment/build limit is active.
4. Finish static review of the staged migrations and check every browser query against the column grants.
5. After owner approval, apply migrations in order, verify schema/grants/RPC signatures, deploy only the required functions, then test on a real phone before announcing readiness.

## Latest review update (2026-11-05 09:15 Sri Lanka time)
- Rechecked live owner identity by joining `staff_profiles.id` to the existing Auth user UUID: the owner profile is present and `approved=true`; the legacy Auth email is the currently provisioned login. This corrects the earlier assumption that the profile's email column was populated.
- Rechecked live products table grants: broad SELECT remains granted to `anon` and `authenticated` until migration 002 is applied.
- Rechecked live public RPC signatures: `owner_save_product_passport(uuid,uuid,jsonb,text)` and `owner_update_product_passport(uuid,jsonb,text)` exist; `owner_list_products()` is still absent.
- Rechecked migration 001: 307 lines, exactly two function definitions, legacy request-table compatibility conversion, private-table RLS/grant hardening, and validated `p_site_origin` logic.
- Rechecked migration 005: 196 lines, one private implementation and one public three-argument wrapper; drops the obsolete two-argument wrapper/implementation.
- Current Vercel check failures are still explicitly `build-rate-limit`; no new build was triggered during this review.


## Additional static review — 2026-11-05
- Reviewed all five staged 2026-11-04 migrations and the changed browser/Edge Function call sites again.
- Confirmed the storefront's direct `products` query selects only columns granted by migration 002: `id,name,description,category,price,currency,image_url,ingredients,batch_number,qr_code,is_active`. Owner catalogue and passport admin modules use `owner_list_products()` instead of direct reads of restricted inventory columns. Public passport reads the passport's own published fields plus only safe product display fields.
- Read-only live SQL confirms `private.has_staff_permission(text,text)` exists, requires a matching approved staff profile, and allows the owner role; this is the authorization dependency used by the staged `team_list_inventory()` RPC. The RPC exposes only an inventory projection and has EXECUTE granted to authenticated users; its internal permission check is still required for each call.
- Read-only live SQL confirms the current order-status RPC is service-role-only and already uses the same status transition / one-time restock safeguards. Migration 004 extends it with `delivered_at`; the Edge Function authenticates the caller and checks approved staff permissions before invoking it.
- The changed owner-invite Edge Function currently allowlists the legacy email that is actually linked to the approved live owner profile. The preferred email is not yet a live Auth identity; do not widen or switch the identity until the owner completes an explicit verified Auth email-change/link process.
- No DDL, migration, Auth identity, Edge Function, PR merge, or production deployment was changed by this review. All checks above are static or read-only; browser/device/checkout/QR-print tests remain outstanding.


## Admin sign-in UI repair and preview — 2026-11-05
- Restored a single clean, compact Owner Sign In modal in `index.html`, using the existing `cic-owner-login-sheet` responsive styles.
- Removed the duplicated OTP button block and removed the non-functional role-preview cards from the sign-in modal. Role selection must not imply access; the original V18 Control Room remains the owner workspace.
- Preserved real Supabase OTP wiring in `supabase-admin-auth.js`, approved-owner profile verification, customer-hidden Admin navigation, and the existing V18 Control Room/dashboard flow.
- Commit: `d10a28b029bc396c4d0c250a04684a2ee34ac6a6`.
- Verified a Vercel preview deployment is READY for this exact commit: `https://craveislandceylonv18supabaseintegratedbuild-jdk3lwa9h.vercel.app` (preview only; production alias unchanged).
- To open the sign-in panel while logged out, tap the CRAVE hero title/logo five times; after successful approved-owner OTP sign-in, the Admin navigation entry becomes visible. This trigger is only an entry point; Supabase Auth + approved owner profile remain the actual access gate.
- Real-phone OTP, navigation, product, and QR tests remain pending. Production DB migrations and production deployment remain untouched.

## Latest continuation audit — 2026-11-05 (after owner preview check)
- Owner reported that the preview opens the storefront but the QR/admin entry is not visible. This is consistent with the current access design: the QR Passport shortcut is intentionally owner-only and stays hidden until an approved owner session is verified. No active product or published passport exists in live data, so there is no genuine customer QR code to display or scan yet. Do not create a sample QR or activate the existing draft just to make an icon appear.
- Rechecked the live Supabase Security Advisor. The remaining INFO finding is public.owner_report_cron_config with RLS enabled and no policies; keep this table closed to browser roles. WARN findings concern cron extension policies and policies that the advisor classifies as anonymous-access-capable; review the actual role predicates before changing any of them. Do not delete owner/customer/team policies to silence the advisor.
- Rechecked the Performance Advisor. It reports four currently unused indexes and multiple permissive authenticated policies for categories, products, passports and orders. Keep the indexes while the project has almost no order traffic; consolidate policies only after proving the owner, staff, customer and published-passport access paths still work.
- Reconfirmed live migration history ends at 20261030141947; none of the five 20261104 staged migrations has been applied.
- Reconfirmed live Edge Functions remain ACTIVE: create-store-order v14, update-order-status v6, owner-alert-notify v11 (JWT verification disabled because its source performs its own request authentication), owner-invite-team-member v2 and update-product-inventory v3. No function was deployed during this audit.
- Rechecked PR #17: still open and draft; no merge performed. GitHub Actions returned no PR workflow runs for the current docs-only head commit. A previous Vercel bot comment confirms the daily free deployment cap was exceeded; no new build was triggered.
- Static SQL review revisited the five staged migrations and atomic product/passport save migration. The intended order and call-site signatures align, but migrations still require an isolated database test and owner approval before production application.
- No production schema, product, order, Auth identity, Edge Function, deployment alias, or PR merge was changed in this continuation.

## 2026-11-05 continuation — inventory UI / column-grant safety gate

- Re-read the complete 1 MB `index.html` through its Git blob (the file-content wrapper returns an empty body for this unusually large file). The legacy V18 workspace contains a visual Stock area and role descriptions, but the active live inventory UI path is not wired to the new `public.team_list_inventory()` RPC.
- Confirmed `supabase-admin-products.js` loads full product rows only through `owner_list_products()`; its catalogue form is explicitly approved-owner-only. It does not implement a scoped staff inventory list.
- Confirmed `202611040003_team_inventory_read_rpc.sql` creates the limited staff inventory projection, but no browser callsite currently invokes it.
- Therefore **do not apply** `202611020002_restrict_public_product_columns.sql` / `202611040002_restrict_public_product_columns.sql` to production yet: broad product SELECT revocation must be preceded by a working staff inventory UI using `team_list_inventory()`, plus role-by-role verification. Applying now risks breaking the stock workflow for staff/supervisors.
- Orders UI currently reads order/customer rows from `store_orders`, loads item rows separately, and sends status changes through the `update-order-status` Edge Function. It enforces UI transition options by owner/orders/dispatch permission; server-side Edge Function authorization remains the security boundary. Delivered timestamp display depends on the staged `delivered_at` migration.
- No database writes, migration applications, function deployments, production changes, PR merge, or new Vercel build were performed in this continuation.
- Next implementation gate: add a scoped inventory view for approved staff that calls `team_list_inventory()` (read-only list first), confirm it is loaded only in the correct role workspace, then add/update inventory mutation through a separately authorized server-side RPC/Edge Function. Only after that should the column-restriction migrations be tested in an isolated Supabase project and considered for release.


## 2026-11-05 live security + inventory recheck (user requested continue immediately)

- Rechecked live Supabase project read-only. Migration history still ends at `20261103141947`; none of the five staged `20261104` migrations are applied.
- Live `public.team_list_inventory()` does not exist yet. The staged migration `202611040003_team_inventory_read_rpc.sql` is therefore not callable in production today.
- Live `staff_profiles` currently contains only one approved owner profile; there are no approved supervisor/staff/media/accounts profiles. The existing browser sign-in code explicitly rejects non-owner roles and says their separate secure sign-in/workspaces are not enabled. Thus a staff inventory UI cannot be responsibly enabled until role invitation/authentication and permission assignment are complete.
- Confirmed `private.has_staff_permission(module, action)` checks `auth.uid()`, `approved=true`, and grants owner all permissions or checks the JSON permission map. `private.is_approved_owner()` requires owner + approved. The staged inventory RPC correctly checks `inventory.read` through this helper and returns a limited inventory projection.
- **Confirmed live exposure requiring remediation:** both `anon` and `authenticated` still have table-level SELECT on `public.products`, and column-level grants currently include operational fields such as `stock_quantity`, `low_stock_threshold`, `expiry_date`, `manufacturing_date`, `storage_location`, `sku`, `allergen_information`, and timestamps. RLS restricts rows but does not make these columns private for rows that the role can select. Keep the staged column-restriction migration high priority, but test all customer storefront/passport queries and owner catalogue RPC first; do not apply until staff inventory is served by the new RPC and staff roles are provisioned.
- Current product RLS includes active-product public read and team/owner read policies; write policies are owner/team scoped. Do not remove policies blindly to silence the advisor.
- Order safety recheck: `create_store_order_atomic` is SECURITY DEFINER with empty search_path and service-role-only; it validates payload, idempotency, product/category/expiry/price/stock, locks product rows in stable order, creates order + items atomically. Order item insert triggers decrement stock; item delete is blocked. `owner_update_store_order_status` is service-role-only, enforces allowed transitions, and uses `stock_restocked_at` to avoid double restock on cancellation. The Edge Function remains the caller authorization boundary.
- Security Advisor (observed 2026-11-05): INFO only for `owner_report_cron_config` RLS enabled/no policies; WARN for cron anonymous-role policies, multiple RLS policies the advisor classifies as anonymous-capable (review actual role/predicate semantics; do not drop), and leaked-password protection disabled. Recommend enabling leaked-password protection in Supabase Auth dashboard after owner review.
- Performance Advisor: four unused indexes and 15 multiple-permissive-policy findings. With almost no order/product traffic, keep indexes; consolidate policies only after role/customer/published-passport tests.
- No production database changes, migration applications, Auth settings changes, Edge Function deployments, PR merge, or Vercel builds were made.
- Immediate implementation sequence: (1) finish role invite + secure role OTP/session authorization; (2) wire a staff-only read-only inventory screen to `team_list_inventory()`; (3) add mutation only through separately authorized server-side operations; (4) run isolated staging tests for product-column grants and every frontend query; (5) only then request approval for production migration rollout.


## 2026-11-05 immediate code fix — order history compatibility

- Found a release-order mismatch: the PR branch's owner Orders and customer My Orders queries requested `store_orders.delivered_at`, but live production schema does not yet contain that column because migration `202611040004_order_delivered_timestamp.sql` is staged only.
- Updated `supabase-admin-orders.js` and `my-orders.html` to retry their otherwise-identical order query without `delivered_at` only when Postgres/PostgREST reports that exact missing-column/schema-cache condition. Other query errors still fail visibly; the code does not hide unrelated failures.
- Owner Orders now shows a concise notice that delivered-at history awaits the approved migration, while order records remain visible. Customer order history continues to load without the optional delivery timestamp.
- JavaScript syntax validation passed for the updated owner orders module and all inline scripts in `my-orders.html`.
- Commits: owner order fallback `caa65cb8421149c14c9d99d38cd5f46ff9ab0205`; customer order fallback `28c9a36e74bfb6bc18bc9118a66f977b0dce5b9b`.
- No Vercel build was triggered. No production schema, data, Auth settings, Edge Functions, or deployment was changed.


## 2026-11-05 immediate security code hardening — inventory Edge Function

- Reviewed `supabase/functions/update-product-inventory/index.ts`. It already validates the bearer token against Supabase Auth, rejects anonymous users, requires an approved staff profile, checks owner or explicit `inventory.update` permission, validates product UUID and numeric/date/boolean fields, and only accepts the inventory field allowlist. It writes using the server-side service-role client; no service key is exposed to the browser.
- Tightened its CORS policy from wildcard `*` to the same exact production origin + constrained Vercel preview hostname allowlist used by the order-status function. Requests from other origins are rejected; OPTIONS and response headers now vary by origin.
- This is a PR-branch source change only. Live Edge Function remains unchanged (currently deployed version v3 per prior inventory); do not claim the CORS hardening is live until a separately approved deployment.
- Commit: `1ffc2cf1c7f8e914377325a109063eeec7d9369f`.
- The updated owner/customer order-history fallback commits are recorded above. No production changes or deployment occurred.

## Inventory and security continuation — 2026-11-05 (review branch only)
- Added per-product inventory controls to the existing owner catalogue panel: stock quantity, low-stock threshold, inventory tracking toggle, and expiry date. Save calls the authenticated `update-product-inventory` Edge Function; browser input validation and server-side validation both remain in place. The owner catalogue still loads product operational fields only through the owner-only `owner_list_products()` RPC.
- Static JavaScript parse check passed after the change. This is code on PR #17 only; no production deployment or database change was made.
- Re-read the live `private.has_staff_permission(text,text)` definition: it requires `auth.uid()`, an approved staff profile, and the requested action in the JSON permission array (or owner role). The staged inventory read RPC uses this check and returns a limited JSON projection.
- Confirmed a live/review mismatch: deployed `update-product-inventory` is active at version 3 and still returns wildcard CORS; the PR branch source has an explicit production + Vercel preview origin allowlist and rejects other origins. Deploy the hardened function only after the branch is reviewed and explicitly approved.
- Inventory update endpoint authorization independently verifies a registered non-anonymous Auth user, approved staff profile, and owner or `inventory.update` permission. It validates UUID, integer ranges, boolean tracking, and real ISO expiry date before using the service-role client.
- The inventory UI was not yet tested in a real browser/device, and there are no approved non-owner staff profiles for an end-to-end staff permission test. Do not claim stock alerts or expiry alerts are live solely because these input controls exist.
- The column-grant migration remains staged. Keep it unapplied until all storefront and passport reads are rechecked and the owner RPC / staff inventory RPC are installed together in migration order.


## 2026-11-05 deeper inventory/security verification

- Read-only catalogue call-site audit on the review branch:
  - Storefront product list requests only `id,name,description,category,price,currency,image_url,ingredients,batch_number,qr_code,is_active`.
  - Public passport page requests only `name,category,description,image_url,price,currency` from `products`; ingredient/allergen/lot/date facts come from the published `product_passports` row.
  - Owner catalogue and owner passport modules call `owner_list_products()`; migration `202611040001_owner_list_products_rpc.sql` creates the owner-only full-row RPC before migration 002 narrows browser column grants.
  - Owner stock controls call `update-product-inventory`; the browser does not write inventory columns directly.
- Rechecked every current public-schema table: RLS is enabled on all nine public tables. `owner_report_cron_config` has no browser table grants, as intended. No public-schema SECURITY DEFINER function in the current live inventory was executable by `anon` or `authenticated`; order atomic/status RPCs are service-role-only. Private permission helpers require approved profiles.
- Confirmed the only direct broad public SELECT exposure among the reviewed business tables is `products`; both `anon` and `authenticated` still have table-level SELECT and operational column grants until the staged owner-RPC + column-grant migrations are applied. The review-branch public storefront/passport call sites use the safe projection, and the owner call sites use the owner RPC. Do not split/reorder migrations 001 and 002.
- Compared deployed and review-branch inventory Edge Function source: live `update-product-inventory` v3 still has `Access-Control-Allow-Origin: *`; PR branch source replaces this with the exact production origin and constrained Vercel preview origin allowlist, rejects other origins, and adds `Vary: Origin`. This hardening is not live until an approved Edge Function deployment.
- Staff inventory remains a distinct pending workflow: live team list RPC is absent, staged `team_list_inventory()` is not yet installed, and live profiles contain only the single approved owner. No staff inventory UI or staff-role end-to-end test is claimed.
- The Security Advisor's anonymous-policy warnings are not proof of public data exposure by themselves: several policies target the authenticated role and contain owner/customer/team predicates. Keep them for now; test anonymous-session semantics and each role before changing them. Leaked-password protection remains a dashboard-level recommended setting.
- No database writes, Auth setting changes, Edge Function deployments, PR merge, or Vercel build occurred during this deeper audit.


## 2026-11-05 inventory alert automation verification

- Read-only live check confirms three active scheduled jobs: daily owner report at 14:30 UTC (20:00 Sri Lanka), pending-alert Telegram dispatcher every minute, and expiry sweep at 18:45 UTC (00:15 Sri Lanka).
- Live `owner-alert-notify` is ACTIVE v11 with JWT verification disabled intentionally because the function performs its own request authentication: scheduled report/dispatcher calls require the stored cron secret; manual alert actions require a valid registered session and approved-owner profile. The cron secret remains in the private, RLS-closed configuration table and is not copied into this handover.
- Live alert generation code records new orders, failed payments/cancellations, low/out-of-stock items, and expiry windows. Stock alerts are critical at zero and warning at/below the configured threshold; expiry alerts are critical when expired or within seven days, and warning for the remainder of the 30-day window. Telegram delivery attempts and failures are recorded on `admin_alerts`.
- Current live product is a hidden prototype with stock tracking off, zero stock, and no expiry date. No live stock/expiry alert was expected from that record. No real sellable product has been activated.
- Alert automation is scheduled and the owner reports have previously been received, but the current audit did not send test alerts or alter products. Real stock/expiry alert delivery should be tested only after a genuine product and verified dates/quantities are entered.


- Additional auth/RLS check: live `auth.users` currently contains 1 registered user and 0 anonymous Auth users. This is only a current-state observation, not a guarantee that anonymous sign-ins are disabled in project Auth settings; keep the actual Auth configuration check as a launch gate.


## 2026-11-05 final cross-check of inventory release path

- Verified the production private idempotency table still uses legacy columns `actor_user_id uuid NOT NULL` and `qr_url text NOT NULL`; staged migration `202611010001_atomic_owner_product_passport_save.sql` contains the exact guarded rename + JSONB conversion needed for that live schema. Both `private.staff_access_audit` and `private.owner_product_save_requests` exist, so the migration's table revokes/RLS statements do not target a missing table.
- Verified the owner inventory UI now loads the complete product projection through `owner_list_products()` and saves stock/threshold/tracking/expiry through the `update-product-inventory` Edge Function; it no longer relies on browser-wide SELECT for those operational fields.
- Cross-checked all product-table browser read call sites on the review branch: storefront and public passport read only safe fields; owner catalogue/passport read through the owner-only RPC; inventory updates use the permission-checked Edge Function. The order-creation Edge Function uses service-role access and validates inventory server-side.
- Verified the passport editor's direct read of `product_passports` is covered by the live approved-owner read policy; public reads remain restricted to published passports for active products. The new passport RPC wrapper remains SECURITY INVOKER and delegates to an owner-checking SECURITY DEFINER implementation.
- JavaScript syntax parsing passed for all five integrated browser modules (`supabase-admin-auth.js`, `supabase-admin-orders.js`, `supabase-admin-products.js`, `supabase-admin-passports.js`, `supabase-store.js`) and inline scripts in `my-orders.html` and `passport.html`.
- No GitHub Actions PR workflow run was associated with the latest handover commit. Syntax checks are static only; browser/mobile runtime, checkout concurrency, and physical QR/label tests remain outstanding.
- Current launch limitation remains: live database has one registered Auth user, one approved owner profile, zero approved team profiles, one hidden prototype product, no active product and no real published QR. Therefore owner inventory UI is code-reviewed but not yet end-to-end verified against a real saleable product or staff account.


## Migration-order defect found and corrected — 2026-11-05

- Live migration history ends at `20261103141947`; the staged atomic product-save migration was originally named `202611010001_...` but was not present in live migration history. That would introduce an unapplied migration timestamp older than already-applied production migrations and risk an out-of-order release.
- Renamed the staged migration to `202611050001_atomic_owner_product_passport_save.sql`, after the five pending `20261104` migrations. It now applies after the owner/product read permissions, team inventory RPC, delivered timestamp and passport-field sync migrations.
- Verified the new file is present on the PR branch and the obsolete `202611010001_...` path is no longer in the PR changed-file list. No SQL was executed against production.
- Apply order is now: `202611040001` → `202611040002` → `202611040003` → `202611040004` → `202611040005` → `202611050001`. Stop on any migration error; do not skip or manually mark a version applied.
