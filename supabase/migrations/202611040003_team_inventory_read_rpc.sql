-- CRAVE ISLAND CEYLON
-- Read-only inventory projection for approved staff with inventory.read.
-- This preserves the stock workflow after browser roles lose broad products SELECT.

create or replace function public.team_list_inventory()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.has_staff_permission('inventory', 'read') then
    raise exception 'approved_inventory_read_required' using errcode = '42501';
  end if;

  return query
    select jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'category', p.category,
      'stock_quantity', p.stock_quantity,
      'low_stock_threshold', p.low_stock_threshold,
      'track_inventory', p.track_inventory,
      'expiry_date', p.expiry_date,
      'manufacturing_date', p.manufacturing_date,
      'storage_location', p.storage_location,
      'batch_number', p.batch_number,
      'sku', p.sku,
      'is_active', p.is_active,
      'updated_at', p.updated_at
    )
    from public.products p
    order by p.name, p.id;
end;
$function$;

revoke all on function public.team_list_inventory() from public, anon, authenticated;
grant execute on function public.team_list_inventory() to authenticated;

comment on function public.team_list_inventory() is
  'Returns a limited inventory projection only to approved staff with inventory.read; full owner product data remains in owner_list_products().';
