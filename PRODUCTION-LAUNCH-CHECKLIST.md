# CRAVE ISLAND CEYLON — Production Launch Checklist

Last reviewed: 2026-10-25

This checklist distinguishes verified infrastructure from business settings that still need the owner's real information. Do not publish invented product, ingredient, allergen, price, payment, or delivery details.

## Verified from the connected project

- [x] Vercel Production deployment reports `READY`.
- [x] Browser Supabase configuration uses a publishable/anonymous key, not a service-role key.
- [x] Product creation in the owner catalogue saves new products as hidden drafts.
- [x] Secure checkout calls the `create-store-order` Edge Function rather than trusting a browser-calculated order total.
- [x] The deployed order function checks the signed-in user and rejects anonymous sessions.
- [x] The deployed order-status function contains an approved-owner check.
- [x] Public product passport lookup requires a published record and an active product.
- [x] The passport page does not invent a product story when none is supplied.

## Required before accepting real customer orders

- [ ] Add and verify each real product: name, LKR price, collection, product photo, ingredients, allergens, storage instructions, batch/expiry details where applicable.
- [ ] Owner reviews every product and explicitly activates only products ready to sell.
- [ ] Configure delivery zones, delivery charges, and any free-delivery threshold. Checkout currently warns that the delivery fee is LKR 0 until rates are configured.
- [ ] Confirm fulfilment, cancellation, returns/refunds, privacy, and customer-support policies.
- [ ] Keep Cash on Delivery as the only checkout payment method until a payment provider is actually integrated and verified. Do not display bank transfer/card payment as available prematurely.
- [ ] Review Supabase Auth security settings, including leaked-password protection, and confirm anonymous sign-ins are not relied on for customer ordering.
- [ ] Review Supabase RLS warnings against the actual intended access model; do not remove policies blindly.
- [ ] Test with a dedicated non-owner customer account: sign up/sign in, create a valid order, confirm the order appears in My Orders and owner order management, and verify the cart clears only after server confirmation.
- [ ] Test invalid product IDs, inactive products, altered prices, duplicate items, expired sessions, and unauthorised order-status changes.
- [ ] Test public QR passports for a published product, unpublished passport, unknown slug, and inactive product.
- [ ] Confirm email/password recovery, mobile layout, image loading, and customer support contact information.
- [ ] Run a final production smoke test after the last deployment.

## Safe release rule

The site may be online while launch preparation continues. Do not announce that checkout, payment, delivery, or the whole business workflow is fully production-tested until the end-to-end tests above have passed. Never create test orders with real customer information or activate placeholder products.
