-- CRAVE ISLAND CEYLON
-- Keep public catalogue reads limited to customer-facing columns.
-- Owner-only inventory and operational fields are returned through an approved-owner RPC.
-- Review branch only. Validate PostgREST column grants and all app flows in isolation before production.

create or replace function private.owner_list_products_impl()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_approved_owner() then
    raise exception 'Approved owner access required' using errcode = '42501';
  end if;

  return query
    select to_jsonb(p)
    from public.products p
    order by p.created_at desc, p.id;
end;
$function$;

revoke all on function private.owner_list_products_impl() from public, anon;
grant execute on function private.owner_list_products_impl() to authenticated;

create or replace function public.owner_list_products()
returns setof jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.owner_list_products_impl();
$wrapper$;

revoke all on function public.owner_list_products() from public, anon;
grant execute on function public.owner_list_products() to authenticated;

-- Remove broad row-level SELECT grants. RLS still determines which product rows
-- can be read, while column grants limit the data exposed to customers.
revoke select on table public.products from public, anon, authenticated;

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

comment on function public.owner_list_products() is
  'Returns full product records only to an approved owner; public catalogue reads use restricted column grants.';
