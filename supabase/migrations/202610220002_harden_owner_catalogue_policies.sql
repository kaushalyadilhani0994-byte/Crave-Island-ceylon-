-- Owner authorization helper is kept outside the exposed public API schema.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.is_approved_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.role = 'owner'
      and sp.approved is true
  );
$$;

revoke all on function private.is_approved_owner() from public;
revoke all on function private.is_approved_owner() from anon;
grant execute on function private.is_approved_owner() to authenticated;

drop policy if exists "Owner manage products" on public.products;
drop policy if exists "Public read active products" on public.products;
create policy "Public read active products"
  on public.products for select to anon
  using (is_active = true);
create policy "Authenticated read permitted products"
  on public.products for select to authenticated
  using (is_active = true or (select private.is_approved_owner()));
create policy "Approved owner insert products"
  on public.products for insert to authenticated
  with check ((select private.is_approved_owner()));
create policy "Approved owner update products"
  on public.products for update to authenticated
  using ((select private.is_approved_owner()))
  with check ((select private.is_approved_owner()));
create policy "Approved owner delete products"
  on public.products for delete to authenticated
  using ((select private.is_approved_owner()));

drop policy if exists "Owner manage categories" on public.categories;
drop policy if exists "Public read active categories" on public.categories;
create policy "Public read active categories"
  on public.categories for select to anon
  using (is_active = true);
create policy "Authenticated read permitted categories"
  on public.categories for select to authenticated
  using (is_active = true or (select private.is_approved_owner()));
create policy "Approved owner insert categories"
  on public.categories for insert to authenticated
  with check ((select private.is_approved_owner()));
create policy "Approved owner update categories"
  on public.categories for update to authenticated
  using ((select private.is_approved_owner()))
  with check ((select private.is_approved_owner()));
create policy "Approved owner delete categories"
  on public.categories for delete to authenticated
  using ((select private.is_approved_owner()));
