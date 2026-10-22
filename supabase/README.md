# CRAVE ISLAND CEYLON — Supabase integration status

## Implemented on `main`
- Browser configuration uses the project's Supabase URL and publishable key. A publishable key is designed for frontend use; never add a `service_role` or secret key to browser code.
- `supabase-store.js` loads active products and categories into the existing V18 storefront without redesigning it.
- A successful catalogue read now treats Supabase as the source of truth, even when there are zero active rows. Demo catalogue items are not silently displayed as if they were live database products.
- The database foundation migration defines customer profiles, orders, order items, and product passports with row-level security.

## Current limitations — not production-ready yet
- The browser connection has been configured, but the deployed site still needs an end-to-end runtime check against the actual Supabase project.
- The cart still uses browser-local storage and checkout is still a WhatsApp request flow.
- Customer authentication, trusted order creation, payment handling, real admin permissions, and product/category writes are not yet complete.
- The existing products/categories schema and RLS policies must be kept compatible with the current integration.

## Database foundation migration
`migrations/202610220001_store_foundation.sql` was previously run by the project owner in the Supabase SQL Editor. **Do not run it again unless checking the table state first.** It intentionally does not alter the existing `categories` or `products` tables.

Tables introduced:
- `customer_profiles`: customer profile tied to Supabase Auth.
- `store_orders`: order and delivery details.
- `store_order_items`: item snapshots for each order.
- `product_passports`: public traceability details, readable only when published.

Order and item tables intentionally have no browser-side insert policy. The next checkout implementation must be a trusted Edge Function that verifies product IDs and current database prices, validates quantities and delivery fee, calculates totals server-side, and does not trust a client-supplied payment status.

## Recommended build sequence
1. Verify deployment and live catalogue reads.
2. Inspect current database schema and RLS policies; test empty catalogue and populated catalogue.
3. Implement and test Supabase Auth and server-enforced admin authorization.
4. Implement a secure order-creation Edge Function and customer order history.
5. Complete real admin product/category management and image storage.
6. Add payment integration only after order validation and security checks pass.
7. Run mobile, desktop, accessibility, and security smoke tests before launch.
