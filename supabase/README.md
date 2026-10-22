# Supabase production foundation

This folder contains a **draft database migration** for CRAVE ISLAND CEYLON.

## Important status

- The migration is committed on the `chatgpt-fix-work` branch only.
- It has **not** been applied to the Supabase project.
- It does not modify the existing `categories` or `products` tables because their exact column types and current policies must be inspected first.
- The current `index.html` still uses browser `localStorage` for cart/order demo state. This migration alone does not connect the storefront to Supabase or make the current checkout production-ready.

## Before applying the migration

1. In Supabase, open **SQL Editor** and inspect the definitions of the existing `public.categories` and `public.products` tables, including the type of each `id` column and current RLS policies.
2. Review the SQL migration with those existing definitions in mind.
3. Apply `migrations/202610220001_store_foundation.sql` only after that review.
4. Implement a trusted Edge Function for order creation. It must verify product IDs, current prices, stock, delivery fee, and calculate the total on the server. Do not allow the browser to decide trusted prices or payment status.
5. Connect the storefront through the Supabase client using the project URL and **publishable/anon key only** in browser code. Never put a service-role key in `index.html`.
6. Add Auth, admin authorization, and storage policies before enabling those features in production.

## Tables introduced by the migration

- `customer_profiles`: customer profile tied to Supabase Auth.
- `store_orders`: customer order and delivery details; customers can read only their own records.
- `store_order_items`: item snapshots tied to an order.
- `product_passports`: product traceability information; only published passports are publicly readable.

The order and item tables intentionally have no browser-side insert policy. A trusted backend must create orders after server-side validation.
