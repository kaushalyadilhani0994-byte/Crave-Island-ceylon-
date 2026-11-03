create or replace function public.owner_update_store_order_status(p_order_id uuid,p_next_status text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_order public.store_orders%rowtype; v_item record;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 if p_order_id is null or p_next_status not in ('confirmed','processing','shipped','delivered','cancelled') then raise exception 'Invalid order status request' using errcode='22023'; end if;
 select * into v_order from public.store_orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
 if v_order.order_status=p_next_status then return jsonb_build_object('ok',true,'replayed',true,'order_id',v_order.id,'order_number',v_order.order_number,'order_status',v_order.order_status); end if;
 if not ((v_order.order_status='pending' and p_next_status in ('confirmed','cancelled')) or (v_order.order_status='confirmed' and p_next_status in ('processing','cancelled')) or (v_order.order_status='processing' and p_next_status in ('shipped','cancelled')) or (v_order.order_status='shipped' and p_next_status='delivered')) then raise exception 'ORDER_STATUS_TRANSITION_NOT_ALLOWED' using errcode='22023'; end if;
 if p_next_status='cancelled' and v_order.stock_restocked_at is null then
  for v_item in select product_id,quantity from public.store_order_items where order_id=v_order.id order by product_id loop
   if v_item.product_id is not null then update public.products set stock_quantity=coalesce(stock_quantity,0)+v_item.quantity,updated_at=now() where id=v_item.product_id::uuid and track_inventory=true; end if;
  end loop;
  update public.store_orders set stock_restocked_at=now() where id=v_order.id;
 end if;
 update public.store_orders set order_status=p_next_status,updated_at=now() where id=v_order.id;
 return jsonb_build_object('ok',true,'replayed',false,'order_id',v_order.id,'order_number',v_order.order_number,'order_status',p_next_status);
end;
$function$;
revoke all on function public.owner_update_store_order_status(uuid,text) from public,anon,authenticated;
grant execute on function public.owner_update_store_order_status(uuid,text) to service_role;