# CRAVE ISLAND CEYLON — Production Launch Checklist

Last reviewed: 2026-10-25

This checklist distinguishes verified infrastructure from business settings that still need the owner's real information. Do not publish invented product, ingredient, allergen, price, payment, or delivery details.

## Verified from the connected project

- [x] Supabase project reports `ACTIVE_HEALTHY`.
- [x] Latest Vercel Production deployment reports `READY` (commit `82a9634cfefb5a78c9430eeffa0b8be4dca6fe25`).
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
- [x] Current checkout only permits Cash on Delivery. Delivery fee is still configured as LKR 0 pending the owner's policy.
- [x] Owner/product/order/passport management source files are present in the repository.

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
