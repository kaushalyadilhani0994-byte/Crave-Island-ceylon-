-- CRAVE ISLAND CEYLON
-- Owner-only full product list for admin modules after public product column grants were narrowed.
-- This migration is intentionally staged on the review branch; do not apply to production without approval.

create or replace function public.owner_list_products()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_approved_owner() then
    raise exception 'approved_owner_required' using errcode = '42501';
  end if;

  return query
    select to_jsonb(p)
      from public.products p
     order by p.created_at desc, p.id;
end;
$function$;

revoke all on function public.owner_list_products() from public, anon, authenticated;
grant execute on function public.owner_list_products() to authenticated;

comment on function public.owner_list_products() is
  'Returns complete product and inventory fields only to an authenticated approved owner. Public catalogue access remains column-restricted.';
