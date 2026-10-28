# CRAVE ISLAND CEYLON — Production Launch Checklist

Last reviewed: 2026-10-25 (public storefront messaging pass)

This checklist distinguishes verified infrastructure from business settings that still need the owner's real information. Do not publish invented product, ingredient, allergen, price, payment, or delivery details.

## Verified from the connected project

- [x] Supabase project reports `ACTIVE_HEALTHY`.
- [x] Latest Vercel Production deployment reports `READY` (commit `732ba391f0f24de3a7da56dc7926aaee8ab49f3e`, deployment `craveislandceylonv18supabaseintegratedbuild-530k8npd2.vercel.app`).
- [x] Browser Supabase configuration uses a publishable/anonymous key, not a service-role key.
- [x] Row Level Security is enabled on all seven public business tables inspected.
- [x] Product creation in the owner catalogue saves new products as hidden drafts.
- [x] The live catalogue reads active products from Supabase and does not fall back to demo products when the database returns zero active products.
- [x] Secure checkout calls the `create-store-order` Edge Function rather than trusting a browser-calculated order total.
- [x] The deployed order function checks the signed-in user and rejects anonymous sessions.
- [x] The deployed order-status function contains an approved-owner check and validates order status transitions.
- [x] Public product passport lookup requires a published record and an active product.
- [x] Restored the QR Passport item in the home page's bottom navigation; it no longer opens the blocked legacy QR generator. The panel explains that verified QR codes require a published product passport and does not fabricate sample codes.
- [x] The passport page does not invent a product story when none is supplied.
- [x] Current live catalogue count: 0 active products (1 inactive/prototype product). No product was activated or altered during this audit.
- [x] All five active collections have a description and an HTTPS image URL; no collection data was changed.
- [x] Vercel runtime-error clusters reported none in the last 24 hours, and the latest 50-minute error/fatal runtime-log query was empty. Raw runtime logs older than the Hobby retention window were unavailable; this is not a substitute for browser-level testing.
- [x] Confirmed the Vercel production alias is verified and points to this project; Supabase Edge Functions `create-store-order` (v8) and `update-order-status` (v2) are ACTIVE with JWT verification enabled.
- [x] Latest source audit: `index.html`, `supabase-admin-auth.js`, `supabase-checkout.js`, `supabase-store.js`, `admin.html`, and `passport.html` passed JavaScript syntax checks. This does not prove runtime flows work in a real browser.
- [x] Current checkout only permits Cash on Delivery. Delivery fee is still configured as LKR 0 pending the owner's policy.
- [x] Owner/product/order/passport management source files are present in the repository.

## Owner sign-in follow-up — 2026-10-25

- [x] Confirmed the configured Supabase email currently sends a sign-in link rather than a visible 6-digit code.
- [x] Updated `supabase-admin-auth.js` on `main` to explain either email format and handle a pending magic-link sign-in by rechecking the approved owner profile. Source commit: `62eb7fd349d83928fc853e3ed0e236efd70b85ed`; JavaScript syntax check passed.
- [x] Removed the unused checkout snapshot that persisted customer names, phone, email, address, and order lines in browser localStorage. The confirmed order remains in Supabase and the page shows its reference/total. Source commit: `c0aecde0cd969cda91f48b0e7fea9ac87cacc373`; JavaScript syntax check passed.
- [x] Latest `main` fixes are now included in the READY production deployment. Verified production alias resolves to the new deployment; live `supabase-admin-auth.js` includes magic-link support and live `supabase-checkout.js` no longer contains the old customer-PII snapshot key.
- [x] Mobile layout CSS fix is present in the live home page; QR Passport navigation is also present. HTTP smoke checks succeeded for the live home page and relevant JavaScript endpoints.
- [ ] Real-browser end-to-end testing is still pending: mobile visual overlap, owner magic-link sign-in, and checkout flow need interaction-level confirmation. HTTP 200 and syntax checks alone do not prove these flows work.

## Public storefront messaging pass — 2026-10-25

- [x] Updated `supabase-store.js` so successful catalogue connection and ordinary loading status messages stay hidden from public customers.
- [x] Replaced raw Supabase/catalogue error details with customer-friendly generic messages; technical details are kept in the browser console for troubleshooting.
- [x] Production deployment for commit `732ba391f0f24de3a7da56dc7926aaee8ab49f3e` reports `READY` and the production alias points to it.
- [ ] Still confirm visually in a real mobile browser that no old cached status message appears and that category/product loading behaves correctly.

## Findings from the latest Supabase advisor review

- [ ] **Leaked-password protection is disabled.** Enable it in Supabase Dashboard → Authentication → Settings/password security, then rerun the security advisor. This is an Auth dashboard setting; it was not changed by this audit.
- [ ] **Review the advisor's anonymous-access warnings.** The inspected policies for customer profiles, staff profiles, products, categories, passports, and order data use the `authenticated` role where appropriate; explicit public catalogue/passport reads use the `anon` role and are limited to active/published records. Do not remove these policies blindly. Recheck the advisor after confirming the intended public-read behaviour.
- [ ] Performance advisor reports multiple permissive SELECT policies for passports and order tables. They represent separate public/owner or customer/owner access cases; consolidate only after testing that public passport lookup, customers' own order history, and approved-owner order access all remain correct.
- [ ] Four indexes are currently reported unused. Keep them for now; order/passport traffic may not yet exist, so do not drop indexes solely on a fresh project's usage statistics.

## Required before accepting real customer orders

- [ ] Add and verify each real product: name, LKR price, collection, product photo, ingredients, allergens, storage instructions, batch/expiry details where applicable.
- [ ] Owner reviews every product and explicitly activates only products ready to sell.
- [ ] Configure delivery zones, delivery charges, and any free-delivery threshold. Checkout currently warns that the delivery fee is LKR 0 until rates are configured.
- [ ] Confirm fulfilment, cancellation, returns/refunds, privacy, and customer-support policies.
- [ ] Keep Cash on Delivery as the only checkout payment method until a payment provider is actually integrated and verified. Do not display bank transfer/card payment as available prematurely.
- [ ] Enable leaked-password protection in Supabase Auth and rerun security advisors.
- [ ] Test with a dedicated non-owner customer account: sign up/sign in, create a valid order, confirm the order appears in My Orders and owner order management, and verify the cart clears only after server confirmation.
- [ ] Test invalid product IDs, inactive products, altered prices, duplicate items, expired sessions, and unauthorised order-status changes.
- [ ] Test public QR passports for a published product, unpublished passport, unknown slug, and inactive product.
- [ ] Confirm email/password recovery, mobile layout, image loading, and customer support contact information.
- [ ] Run a final production smoke test after the last deployment (browser-level interaction check is still pending).

## Safe release rule

The site may be online while launch preparation continues. Do not announce that checkout, payment, delivery, or the whole business workflow is fully production-tested until the end-to-end tests above have passed. Never create test orders with real customer information or activate placeholder products.

## Follow-up audit — 2026-10-27

- [x] Rechecked Supabase counts: 60 categories total, 14 active; 1 product total and 0 active products. No products were created or activated.
- [x] Rechecked core Row Level Security policies: public reads are limited to active categories/products and published passports; product/category writes and owner order reads are guarded by `private.is_approved_owner()`; customers' order reads are scoped to their own user ID.
- [x] Fixed an owner-UI gate in `supabase-admin-auth.js`: a Supabase session by itself no longer unlocks owner shortcuts; the UI now also requires the current browser session's verified six-digit OTP marker and an approved owner profile. Source commit: `445c1c0b757770e7bd10037e671f46ecd30e3833`.
- [x] Confirmed Vercel production deployment for that commit is `READY` (deployment `dpl_7SBnJaFMv8Lh9uB2V4DTHnFLwM5z`).
- [x] Confirmed Supabase Edge Functions `create-store-order`, `update-order-status`, and `owner-alert-notify` are ACTIVE with JWT verification enabled.
- [ ] Owner email delivery is **not yet verified as a true six-digit OTP**. The source calls `verifyOtp`, but the Supabase email template must display the token (rather than only a sign-in link) and the live email must be tested.
- [ ] Leaked-password protection remains disabled in Supabase Auth. This requires the Auth dashboard setting; it has not been changed here.
- [ ] Browser-level owner/customer flows and real QR scans remain untested in this audit. Do not treat READY deployment or passing source checks as a full launch sign-off.

- [x] Additional database defense-in-depth fix on 2026-10-27: public passport reads now require both `published = true` and a matching active product. Migration `20261027133941_secure_public_passports_active_product` was applied and the resulting policy was re-read from `pg_policies` to verify it is present.
- [ ] Supabase Auth leaked-password protection remains a dashboard-only blocker; this connected toolset cannot edit that Auth setting. Do not mark the final security review complete until it is enabled and the advisor warning clears.


## Owner dashboard restoration follow-up — 2026-10-28

- [x] Restored the original four-card owner dashboard in `supabase-admin-auth.js` after approved owner OTP: Products & Catalogue, Customer Orders, QR Product Passports, and Open Storefront. Source commit: `748275aff7375429597169559e6c2e6b246257c9`.
- [x] Confirmed Vercel Production deployment `dpl_J8rJr1r1uxbefaN88a9EEpMaDLBk` reports `READY` and its Git commit matches the restoration commit.
- [x] Confirmed the restored dashboard retains the approved-owner email/profile check and OTP verification path. The browser Supabase configuration contains a publishable key, not a service-role key.
- [x] Vercel runtime-error aggregation returned no runtime errors for the selected 24-hour window. This does not verify client-side interactions or guarantee absence of browser errors.
- [ ] Still required: test the owner OTP flow on a real mobile browser; verify the old four-card dashboard is the first owner screen; click each of the three live-tool cards and confirm the correct panel opens; sign out and confirm owner controls are hidden; test as a separate non-owner customer and confirm no admin UI is exposed.
- [ ] Still required before launch sign-off: enable leaked-password protection in Supabase Auth; verify the live email actually supplies a six-digit OTP (or adjust the flow to match the configured email template); complete customer checkout/order and public QR passport end-to-end tests; review delivery-fee/policy settings and real product details.
- [ ] Current catalogue remains at 0 active products. Do not activate placeholder products or claim the shop is ready to accept customer orders until real product data and required end-to-end checks are complete.


## Owner entry and sign-in follow-up — 2026-10-28

- [x] Found and fixed a critical storefront wiring issue: `supabase-admin-auth.js` existed in the repository but was not loaded by `index.html`, so its approved-owner OTP gate and four-card dashboard code could not run from the actual storefront. The storefront now loads the owner-auth script after the Supabase client/catalogue scripts.
- [x] Removed the duplicate inline five-tap owner trigger so the dedicated owner-auth script owns that entry path and the `?owner-access=1` route.
- [x] Updated the owner sign-in copy to accurately support either a six-digit email token or an email magic link, depending on the configured Supabase email template. The callback still checks the approved owner profile before opening the dashboard.
- [x] Source JavaScript syntax checks passed for `supabase-admin-auth.js`, `supabase-store.js`, and `supabase-checkout.js`. HTML is checked structurally by confirming the single auth-script include is after `supabase-store.js`; `index.html` is HTML, not standalone JavaScript.
- [ ] The latest source commit must deploy to the V18 production alias and then be tested in a real mobile browser. A READY build alone is not proof that the sign-in interaction works.
- [ ] Only the primary owner currently has an Auth user linked to an approved `staff_profiles` owner row. The second intended owner email is allowlisted in the front end but has no Auth user/profile approval yet; it must not be treated as active until provisioned and approved.
- [ ] Supabase Auth leaked-password protection remains a dashboard-only security action. Do not mark the security review complete until it is enabled and the advisor warning clears.
