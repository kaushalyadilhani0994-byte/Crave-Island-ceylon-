-- CRAVE ISLAND CEYLON
-- Storefront users may read only customer-safe catalogue fields.
-- Inventory, expiry, SKU, manufacturing and storage fields are private.
-- Approved owners retrieve the full product row through owner_list_products().
--
-- Revoke broad table grants from both browser roles. Authenticated customers
-- must not inherit operational fields merely because they have a login.
revoke select on table public.products from anon, authenticated, public;

-- Remove any earlier column-level grants for operational fields.
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
) on table public.products from anon, authenticated, public;

-- Keep only the fields needed by the public storefront and product passport.
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
) on table public.products to anon, authenticated;

comment on table public.products is
  'Browser roles can read storefront-safe catalogue fields only; inventory, expiry, SKU, manufacturing, storage and operational fields require approved-owner access.';
