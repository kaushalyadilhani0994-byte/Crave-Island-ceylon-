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
- The cart still uses browser-local storage and the current storefront checkout is still a WhatsApp request flow; the new secure order endpoint is deployed but is not wired into the storefront yet.
- Customer sign-up/sign-in UI, checkout integration with the order endpoint, payment handling, customer order history, and admin product/category write workflows are not yet complete.
- The `create-store-order` Edge Function is deployed with JWT verification enabled. It validates the signed-in user, active products, quantities, and current database prices server-side; only COD and bank transfer are accepted for now. The endpoint is not yet called by the existing checkout UI. `staff_profiles` has a self-read RLS policy, while its existing owner-management policies still require an approved owner row to be seeded securely.
- The existing products/categories schema and RLS policies must be kept compatible with the current integration.

## Database foundation migration
`migrations/202610220001_store_foundation.sql` was previously run by the project owner in the Supabase SQL Editor. **Do not run it again unless checking the table state first.** It intentionally does not alter the existing `categories` or `products` tables.

Tables introduced:
- `customer_profiles`: customer profile tied to Supabase Auth.
- `store_orders`: order and delivery details.
- `store_order_items`: item snapshots for each order.
- `product_passports`: public traceability details, readable only when published.

Order and item tables intentionally have no browser-side insert policy. The next checkout implementation must be a trusted Edge Function that verifies product IDs and current database prices, validates quantities and delivery fee, calculates totals server-side, and does not trust a client-supplied payment status.

## Secure order endpoint
Source: `functions/create-store-order/index.ts`. The deployed `create-store-order` function requires a valid Supabase user JWT, checks the requested active products and current LKR prices server-side, calculates totals on the server, and stores the order plus item snapshots. It rejects online payments until a real payment provider is integrated. Delivery fee is temporarily set to zero and must be configured before public launch. The existing storefront checkout still needs to be connected to this endpoint and tested with a real signed-in test account.

## Latest security fix
A follow-up migration added `Staff read own profile` for authenticated users and revoked direct `EXECUTE` grants on `public.rls_auto_enable()` for `PUBLIC`, `anon`, and `authenticated`. A fresh Supabase security-advisor check no longer reports the earlier RLS/function exposure findings. The remaining warning is leaked-password protection being disabled.

## Recommended build sequence
1. Verify deployment and live catalogue reads.
2. Inspect current database schema and RLS policies; test empty catalogue and populated catalogue.
3. Implement and test Supabase Auth and server-enforced admin authorization.
4. Implement a secure order-creation Edge Function and customer order history.
5. Complete real admin product/category management and image storage.
6. Add payment integration only after order validation and security checks pass.
7. Run mobile, desktop, accessibility, and security smoke tests before launch.
