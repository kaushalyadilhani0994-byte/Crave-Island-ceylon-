-- CRAVE ISLAND CEYLON
-- Public QR passport rows are readable only while the linked product is active.
-- Owner read access remains governed by the separate approved-owner policy.
-- Review branch only. Apply to production only after isolated RLS tests and explicit approval.

drop policy if exists "Anyone reads published product passports" on public.product_passports;

create policy "Anyone reads published passports for active products"
on public.product_passports
for select
to anon, authenticated
using (
  published is true
  and exists (
    select 1
    from public.products p
    where p.id::text = product_passports.product_id
      and p.is_active is true
  )
);
