# CRAVE ISLAND CEYLON — Supabase integration status

## Implemented on `main`
- Browser configuration uses the project's Supabase URL and publishable key. Never add a `service_role` or secret key to browser code.
- `supabase-store.js` loads active products and categories into the existing V18 storefront without redesigning it.
- A successful catalogue read treats Supabase as the source of truth, even when there are zero active rows; demo products are not silently shown as live products.
- The database foundation migration defines customer profiles, orders, order items, and product passports with row-level security.
- Required table grants are tracked in `202610220002_grant_rls_protected_store_table_access.sql`; RLS still controls row access.
- Approved owners now have read-only RLS access to all order headers and order items, tracked in `202610220003_approved_owner_order_read_access.sql`. This is groundwork for order review, not a completed order-management screen.

## Current limitations — not production-ready yet
- Live Supabase logs now show successful HTTP 200 catalogue requests for both products and categories after the table-grant fix.
- The latest Vercel production deployment is READY. This does not by itself prove every browser flow works end-to-end.
- The database currently has zero products, zero categories, and zero orders. The live catalogue will remain empty until real, verified product data is added.
- Security advisor currently reports one warning: leaked-password protection is disabled in Supabase Auth.
- Cart state is stored in browser local storage. Customer order history is incomplete.
- Customer email/password sign-up and sign-in UI is wired to Supabase Auth. Email confirmation may be required by Auth settings. Checkout requires a signed-in customer and supports only cash on delivery or bank transfer; online card payments are not integrated.
- The owner catalogue panel is intended to add products, create/reactivate categories, list live products, and deactivate products. Owner login and actual product management still need a live user-session test. Category editing, image uploads to Storage, and full order-management screens remain incomplete.
- The deployed `create-store-order` Edge Function requires a valid JWT, validates active product IDs and current LKR prices server-side, calculates totals server-side, and stores order/item snapshots. It rejects unsupported payment methods. Delivery fee is currently zero. A successful end-to-end order has not yet been verified with an authenticated customer and real product row.
- The approved-owner order policies are read-only. No browser policy grants owners permission to edit order totals or payment state.

## Database foundation migration
`migrations/202610220001_store_foundation.sql` was previously run by the project owner in Supabase SQL Editor. **Do not run it again unless checking the table state first.** It intentionally does not alter existing `categories` or `products` tables.

Tables introduced:
- `customer_profiles`: customer profile tied to Supabase Auth.
- `store_orders`: order and delivery details.
- `store_order_items`: item snapshots for each order.
- `product_passports`: public traceability details, readable only when published.

Order and item tables intentionally have no browser-side insert policy. Checkout creates orders through the trusted Edge Function, which verifies product IDs/prices, validates quantities, calculates totals server-side, and does not trust client-supplied payment status.

## Secure order endpoint
Source: `functions/create-store-order/index.ts`. The deployed `create-store-order` function requires a valid Supabase user JWT, checks active products and current LKR prices, calculates totals on the server, and stores the order plus item snapshots. It rejects online payments until a real payment provider is integrated. Delivery fee must be configured before public launch. A real end-to-end order still needs testing with a signed-in customer and at least one real product row.

## Security
A follow-up migration added self-read access for staff profiles and revoked direct execute grants on `public.rls_auto_enable()`. Owner product/category policies use a helper in the non-public `private` schema to avoid recursive RLS checks. The latest security advisor shows only the leaked-password-protection warning.

## Remaining launch work
1. Live-test owner login and product add/deactivate from a real browser session.
2. Add verified categories and real products with actual prices, ingredients, images, allergen details, and traceability data.
3. Test customer sign-up/sign-in and a real test order end-to-end.
4. Finish owner order review/status workflow, category editing, and image uploads.
5. Configure delivery fees and enable leaked-password protection in Supabase Auth.
6. Integrate a payment provider only after order validation/security checks.
7. Run mobile, desktop, accessibility, and security smoke tests before launch.
