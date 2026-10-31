-- Add manufacturing date to the public product traceability passport.
alter table public.product_passports
  add column if not exists manufacturing_date date;
comment on column public.product_passports.manufacturing_date is
  'Verified manufacturing / production date for this product batch';
