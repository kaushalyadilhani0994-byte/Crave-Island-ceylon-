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
