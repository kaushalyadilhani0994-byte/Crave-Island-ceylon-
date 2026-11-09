-- Keep the public catalogue readable without exposing private inventory and
-- operational columns from the products table.
revoke select on table public.products from anon;
grant select (
  id, name, description, category, price, currency, image_url,
  ingredients, batch_number, qr_code, is_active
) on table public.products to anon;
-- Authenticated owner/team RPCs require full row visibility; RLS continues to
-- limit which rows each authenticated user can read.
grant select on table public.products to authenticated;
