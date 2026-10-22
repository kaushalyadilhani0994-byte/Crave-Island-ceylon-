# CRAVE ISLAND CEYLON — Supabase integration status

## Implemented on `main`
- Browser configuration uses the project's Supabase URL and publishable key. A publishable key is designed for frontend use; never add a `service_role` or secret key to browser code.
- `supabase-store.js` loads active products and categories into the existing V18 storefront without redesigning it.
- A successful catalogue read now treats Supabase as the source of truth, even when there are zero active rows. Demo catalogue items are not silently displayed as if they were live database products.
- The database foundation migration defines customer profiles, orders, order items, and product passports with row-level security.

## Current limitations — not production-ready yet
- The storefront rendering hook and connection-error state have been corrected in code; deployment is READY, but browser-level runtime behaviour still needs a final live smoke test.
- The Supabase project currently has zero products and zero categories, so the storefront correctly shows an empty catalogue until real catalogue rows are added.
- Security advisor findings for the staff profile RLS policy and publicly callable `rls_auto_enable()` function were addressed; the remaining security advisor finding is leaked-password protection being disabled in Auth.
- The cart is still stored in browser-local storage; confirmed orders are created through the authenticated `create-store-order` Edge Function. Customer order history remains incomplete.
- Customer email/password sign-up and sign-in UI is wired to Supabase Auth. Email confirmation may be required depending on the project's Auth settings. Checkout requires a signed-in customer and accepts only COD or bank transfer; online card payment remains disabled.
- The owner catalogue panel can add products to Supabase, create/reactivate their category, list live products, and deactivate products. These actions check the signed-in user's approved owner profile and rely on database RLS. Category editing, image uploads to Storage, and full order-management screens remain incomplete.
- The `create-store-order` Edge Function is deployed with JWT verification enabled and is called by checkout. It validates the signed-in user, active products, quantities, and current database prices server-side; only COD and bank transfer are accepted. `staff_profiles` has a self-read RLS policy. Product/category owner policies use a `SECURITY DEFINER` helper in the non-public `private` schema to avoid recursive RLS checks; an approved owner profile row exists in the database, but its real sign-in and admin permissions still need a live test.
- The existing products/categories schema and RLS policies must be kept compatible with the current integration.

## Database foundation migration
`migrations/202610220001_store_foundation.sql` was previously run by the project owner in the Supabase SQL Editor. **Do not run it again unless checking the table state first.** It intentionally does not alter the existing `categories` or `products` tables.

Tables introduced:
- `customer_profiles`: customer profile tied to Supabase Auth.
- `store_orders`: order and delivery details.
- `store_order_items`: item snapshots for each order.
- `product_passports`: public traceability details, readable only when published.

Order and item tables intentionally have no browser-side insert policy. The checkout calls a trusted Edge Function that verifies product IDs and current database prices, validates quantities, calculates totals server-side, and does not trust a client-supplied payment status.

## Secure order endpoint
Source: `functions/create-store-order/index.ts`. The deployed `create-store-order` function requires a valid Supabase user JWT, checks the requested active products and current LKR prices server-side, calculates totals on the server, and stores the order plus item snapshots. It rejects online payments until a real payment provider is integrated. Delivery fee is temporarily set to zero and must be configured before public launch. The storefront checkout is now connected to this endpoint. A real end-to-end order still needs testing with an authenticated customer and at least one real product row.

## Latest security fix
A follow-up migration added `Staff read own profile` for authenticated users and revoked direct `EXECUTE` grants on `public.rls_auto_enable()` for `PUBLIC`, `anon`, and `authenticated`. A fresh Supabase security-advisor check no longer reports the earlier RLS/function exposure findings or public-schema security-definer helper exposure. The remaining warning is leaked-password protection being disabled. Owner catalogue policies were moved to a helper in the non-public `private` schema and use init-plan-safe `(select ...)` calls.

## Recommended build sequence
1. Verify the latest deployment and live catalogue reads in a real browser.
2. Add verified categories and products with actual prices, ingredients, images, allergens, and traceability data.
3. Test sign-up/sign-in and a secure order using an authenticated test customer.
4. Test the existing approved owner profile and RLS-protected product add/deactivate workflow in a live browser; complete category editing and image storage.
5. Configure delivery fees and enable leaked-password protection in Supabase Auth.
6. Add payment integration only after order validation and security checks pass.
7. Run mobile, desktop, accessibility, and security smoke tests before launch.
