-- CRAVE ISLAND CEYLON
-- Owner-only product activation. Review branch only; do not apply until migration
-- history is reconciled and the full product/passport RPC path is tested.
create or replace function private.owner_set_product_active_impl(
  p_product_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_parent_id uuid;
begin
  if auth.uid() is null or not private.is_approved_owner() then
    raise exception 'approved_owner_required' using errcode = '42501';
  end if;

  if p_product_id is null or p_is_active is null then
    raise exception 'invalid_activation_request' using errcode = '22023';
  end if;

  select *
    into v_product
    from public.products
   where id = p_product_id
   for update;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  if p_is_active then
    if nullif(btrim(v_product.name), '') is null
       or nullif(btrim(coalesce(v_product.ingredients, '')), '') is null
       or v_product.price <= 0
       or v_product.currency <> 'LKR' then
      raise exception 'product_missing_verified_sale_details' using errcode = '22023';
    end if;

    if v_product.name ~* '(prototype|not[[:space:]]+for[[:space:]]+sale|test[[:space:]]+product|sample[[:space:]]+only)' then
      raise exception 'test_product_cannot_be_activated' using errcode = '22023';
    end if;

    select c.parent_id
      into v_parent_id
      from public.categories c
     where c.name = v_product.category
       and c.is_active is true;

    if not found then
      raise exception 'active_category_required' using errcode = '22023';
    end if;

    if v_parent_id is not null
       and not exists (
         select 1
           from public.categories parent
          where parent.id = v_parent_id
            and parent.is_active is true
       ) then
      raise exception 'active_parent_category_required' using errcode = '22023';
    end if;

    if v_product.manufacturing_date is not null
       and v_product.expiry_date is not null
       and v_product.manufacturing_date > v_product.expiry_date then
      raise exception 'invalid_product_date_range' using errcode = '22023';
    end if;

    if v_product.expiry_date is not null
       and v_product.expiry_date < (now() at time zone 'Asia/Colombo')::date then
      raise exception 'expired_product_cannot_be_activated' using errcode = '22023';
    end if;
  end if;

  update public.products
     set is_active = p_is_active,
         updated_at = now()
   where id = p_product_id;
end;
$function$;

revoke all on function private.owner_set_product_active_impl(uuid, boolean) from public, anon;
grant execute on function private.owner_set_product_active_impl(uuid, boolean) to authenticated;

create or replace function public.owner_set_product_active(
  p_product_id uuid,
  p_is_active boolean
)
returns void
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.owner_set_product_active_impl(p_product_id, p_is_active);
$wrapper$;

revoke all on function public.owner_set_product_active(uuid, boolean) from public, anon;
grant execute on function public.owner_set_product_active(uuid, boolean) to authenticated;

comment on function public.owner_set_product_active(uuid, boolean) is
  'Approved-owner-only product activation with sale-detail, category, and expiry checks.';
