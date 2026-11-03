-- Owner-only product activation RPC. Review branch only.
create or replace function private.owner_set_product_active_impl(p_product_id uuid,p_is_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v public.products%rowtype;
begin
 if auth.uid() is null or not private.is_approved_owner() then raise exception 'approved_owner_required' using errcode='42501'; end if;
 if p_product_id is null or p_is_active is null then raise exception 'invalid_activation_request' using errcode='22023'; end if;
 select * into v from public.products where id=p_product_id for update;
 if not found then raise exception 'product_not_found' using errcode='P0002'; end if;
 if p_is_active then
   if nullif(btrim(v.name),'') is null or nullif(btrim(coalesce(v.ingredients,'')),'') is null or v.price<=0 or v.currency<>'LKR' then raise exception 'product_missing_verified_sale_details' using errcode='22023'; end if;
   if not exists(select 1 from public.categories c where c.name=v.category and c.is_active) then raise exception 'active_category_required' using errcode='22023'; end if;
   if v.name ~* '(prototype|not[[:space:]]+for[[:space:]]+sale|test[[:space:]]+product|sample[[:space:]]+only)' then raise exception 'test_product_cannot_be_activated' using errcode='22023'; end if;
 end if;
 update public.products set is_active=p_is_active,updated_at=now() where id=p_product_id;
end $$;
revoke all on function private.owner_set_product_active_impl(uuid,boolean) from public,anon;
grant execute on function private.owner_set_product_active_impl(uuid,boolean) to authenticated;
create or replace function public.owner_set_product_active(p_product_id uuid,p_is_active boolean)
returns void language sql security invoker set search_path='' as $$ select private.owner_set_product_active_impl(p_product_id,p_is_active) $$;
revoke all on function public.owner_set_product_active(uuid,boolean) from public,anon;
grant execute on function public.owner_set_product_active(uuid,boolean) to authenticated;
