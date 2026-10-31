-- CRAVE ISLAND CEYLON — product traceability and inventory details
-- Additive only: preserves all existing product rows and values.
alter table public.products
  add column if not exists manufacturing_date date,
  add column if not exists storage_location text,
  add column if not exists allergen_information text;

comment on column public.products.manufacturing_date is
  'Manufacturing / production date printed on the product pack';
comment on column public.products.storage_location is
  'Physical storage location for owner inventory tracking';
comment on column public.products.allergen_information is
  'Verified allergen declaration and cross-contact information';
