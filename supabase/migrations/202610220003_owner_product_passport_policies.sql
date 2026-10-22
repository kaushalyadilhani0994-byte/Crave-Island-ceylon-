-- Allow only approved owners to manage product passport records.
-- Published passports remain publicly readable under the existing SELECT policy.
create policy "Approved owner reads all product passports"
on public.product_passports for select to authenticated
using ((select private.is_approved_owner()));

create policy "Approved owner inserts product passports"
on public.product_passports for insert to authenticated
with check ((select private.is_approved_owner()));

create policy "Approved owner updates product passports"
on public.product_passports for update to authenticated
using ((select private.is_approved_owner()))
with check ((select private.is_approved_owner()));

create policy "Approved owner deletes product passports"
on public.product_passports for delete to authenticated
using ((select private.is_approved_owner()));
