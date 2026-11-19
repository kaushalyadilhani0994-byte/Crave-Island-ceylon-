drop policy if exists cic_payments_insert on public.store_payment_records;
create or replace function public.owner_record_payment(p_order_id uuid,p_amount numeric,p_method text,p_reference text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.store_orders%rowtype;declare v_existing numeric;declare v_payment public.store_payment_records%rowtype;
begin
 if not(private.is_approved_owner() or private.has_staff_permission('payments','create')) then raise exception 'permission_denied';end if;
 if p_order_id is null or p_amount is null or p_amount<=0 or p_method not in('bank_transfer','cash_on_delivery','card_manual','other') then raise exception 'invalid_payment_details';end if;
 select * into v_order from public.store_orders where id=p_order_id for update;if not found then raise exception 'order_not_found';end if;
 select coalesce(sum(amount),0) into v_existing from public.store_payment_records where order_id=p_order_id and status in('pending','verified');
 if v_existing+p_amount>v_order.total then raise exception 'payment_exceeds_outstanding_balance';end if;
 insert into public.store_payment_records(order_id,amount,payment_method,reference_number,notes,created_by)
 values(p_order_id,p_amount,p_method,left(p_reference,120),left(p_notes,1000),auth.uid()) returning * into v_payment;
 return jsonb_build_object('payment',to_jsonb(v_payment),'remaining_balance',v_order.total-v_existing-p_amount);
end $$;
revoke all on function public.owner_record_payment(uuid,numeric,text,text,text) from public,anon;
grant execute on function public.owner_record_payment(uuid,numeric,text,text,text) to authenticated;