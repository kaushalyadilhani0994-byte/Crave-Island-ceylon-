-- CRAVE ISLAND CEYLON
-- Keep storefront reads public while hiding operational inventory fields.
-- Public catalogue code reads only the explicit allowlist below; owner tools use
-- the approved-owner RPCs for full inventory data.

revoke select on table public.products from anon, public;
revoke select (
  stock_quantity,
  low_stock_threshold,
  track_inventory,
  expiry_date,
  sku,
  manufacturing_date,
  storage_location,
  allergen_information,
  created_at,
  updated_at
) on table public.products from anon, public;

grant select (
  id,
  name,
  description,
  category,
  price,
  currency,
  image_url,
  ingredients,
  batch_number,
  qr_code,
  is_active
) on table public.products to anon;

comment on table public.products is
  'Public storefront access is column-limited; inventory, expiry, storage and operational fields are owner-only.';
