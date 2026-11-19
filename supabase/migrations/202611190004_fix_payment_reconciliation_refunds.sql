create or replace function public.owner_set_payment_record_status(p_payment_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_payment public.store_payment_records%rowtype; declare v_total numeric; declare v_verified numeric; declare v_result text; declare v_refunded numeric;
begin
 if not(private.is_approved_owner() or private.has_staff_permission('payments','update')) then raise exception 'permission_denied';end if;
 if p_status not in('pending','verified','rejected','refunded') then raise exception 'invalid_payment_status';end if;
 select * into v_payment from public.store_payment_records where id=p_payment_id for update;
 if not found then raise exception 'payment_not_found';end if;
 update public.store_payment_records set status=p_status,notes=coalesce(left(p_notes,1000),notes),verified_by=case when p_status='verified' then auth.uid() else verified_by end,verified_at=case when p_status='verified' then now() else verified_at end,updated_at=now() where id=p_payment_id returning * into v_payment;
 select total into v_total from public.store_orders where id=v_payment.order_id for update;
 select coalesce(sum(amount),0) into v_verified from public.store_payment_records where order_id=v_payment.order_id and status='verified';
 select coalesce(sum(amount),0) into v_refunded from public.store_payment_records where order_id=v_payment.order_id and status='refunded';
 if v_verified>=v_total then v_result:='paid';update public.store_orders set payment_status='paid',updated_at=now() where id=v_payment.order_id;update public.store_invoices set status='paid',updated_at=now() where order_id=v_payment.order_id and status<>'void';
 elsif v_refunded>0 then v_result:='refunded';update public.store_orders set payment_status='refunded',updated_at=now() where id=v_payment.order_id;update public.store_invoices set status='issued',updated_at=now() where order_id=v_payment.order_id and status='paid';
 else v_result:='pending';update public.store_orders set payment_status='pending',updated_at=now() where id=v_payment.order_id and payment_status='paid';update public.store_invoices set status='issued',updated_at=now() where order_id=v_payment.order_id and status='paid';end if;
 return jsonb_build_object('payment',to_jsonb(v_payment),'verified_total',v_verified,'refunded_total',v_refunded,'order_payment_status',v_result);
end $$;
revoke all on function public.owner_set_payment_record_status(uuid,text,text) from public,anon;
grant execute on function public.owner_set_payment_record_status(uuid,text,text) to authenticated;