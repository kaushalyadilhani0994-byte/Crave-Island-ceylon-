alter table public.loyalty_transactions add column if not exists request_id uuid;
create unique index if not exists loyalty_transactions_request_id_uidx on public.loyalty_transactions(request_id) where request_id is not null;
drop policy if exists cic_owner_settings_all on public.store_settings;
create policy cic_settings_read on public.store_settings for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('store_settings','read'));
create policy cic_settings_update on public.store_settings for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('store_settings','update')) with check(private.is_approved_owner() or private.has_staff_permission('store_settings','update'));
drop policy if exists cic_loyalty_accounts_write on public.loyalty_accounts;
create policy cic_loyalty_accounts_update on public.loyalty_accounts for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','update')) with check(private.is_approved_owner() or private.has_staff_permission('loyalty','update'));
drop policy if exists cic_loyalty_rewards_all on public.loyalty_rewards;
create policy cic_loyalty_rewards_read on public.loyalty_rewards for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','read'));
create policy cic_loyalty_rewards_insert on public.loyalty_rewards for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('loyalty','create'));
create policy cic_loyalty_rewards_update on public.loyalty_rewards for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','update')) with check(private.is_approved_owner() or private.has_staff_permission('loyalty','update'));
create policy cic_loyalty_rewards_delete on public.loyalty_rewards for delete to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','delete'));
drop policy if exists cic_scratch_campaigns_all on public.scratch_campaigns;
create policy cic_scratch_campaigns_read on public.scratch_campaigns for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('scratch_cards','read'));
create policy cic_scratch_campaigns_insert on public.scratch_campaigns for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('scratch_cards','create'));
create policy cic_scratch_campaigns_update on public.scratch_campaigns for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('scratch_cards','update')) with check(private.is_approved_owner() or private.has_staff_permission('scratch_cards','update'));
create policy cic_scratch_campaigns_delete on public.scratch_campaigns for delete to authenticated using(private.is_approved_owner() or private.has_staff_permission('scratch_cards','delete'));
drop policy if exists cic_invoices_all on public.store_invoices;
create policy cic_invoices_read on public.store_invoices for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('invoices','read'));
create policy cic_invoices_insert on public.store_invoices for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('invoices','create'));
create policy cic_invoices_update on public.store_invoices for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('invoices','update')) with check(private.is_approved_owner() or private.has_staff_permission('invoices','update'));
drop policy if exists cic_payments_all on public.store_payment_records;
create policy cic_payments_read on public.store_payment_records for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('payments','read'));
create policy cic_payments_insert on public.store_payment_records for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('payments','create'));
create policy cic_payments_update on public.store_payment_records for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('payments','update')) with check(private.is_approved_owner() or private.has_staff_permission('payments','update'));
drop policy if exists cic_media_all on public.media_assets;
create policy cic_media_read on public.media_assets for select to authenticated using(private.is_approved_owner() or private.has_staff_permission('media','read'));
create policy cic_media_insert on public.media_assets for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('media','create'));
create policy cic_media_update on public.media_assets for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('media','update')) with check(private.is_approved_owner() or private.has_staff_permission('media','update'));
create policy cic_media_delete on public.media_assets for delete to authenticated using(private.is_approved_owner() or private.has_staff_permission('media','delete'));
create or replace function public.owner_adjust_loyalty_points(p_customer_id uuid,p_delta integer,p_note text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_balance integer;declare v_existing public.loyalty_transactions%rowtype;
begin
 if not(private.is_approved_owner() or private.has_staff_permission('loyalty','update')) then raise exception 'permission_denied';end if;
 if p_customer_id is null or p_delta is null or p_delta=0 or p_request_id is null then raise exception 'invalid_adjustment';end if;
 select * into v_existing from public.loyalty_transactions where request_id=p_request_id;
 if found then select points_balance into v_balance from public.loyalty_accounts where customer_id=v_existing.customer_id;return jsonb_build_object('replayed',true,'points_balance',coalesce(v_balance,0),'transaction_id',v_existing.id);end if;
 insert into public.loyalty_accounts(customer_id) values(p_customer_id) on conflict(customer_id) do nothing;
 select points_balance into v_balance from public.loyalty_accounts where customer_id=p_customer_id for update;
 if v_balance+p_delta<0 then raise exception 'insufficient_points';end if;
 update public.loyalty_accounts set points_balance=points_balance+p_delta,lifetime_points=lifetime_points+greatest(p_delta,0),updated_at=now() where customer_id=p_customer_id returning points_balance into v_balance;
 insert into public.loyalty_transactions(customer_id,points_delta,event_type,note,created_by,request_id) values(p_customer_id,p_delta,case when p_delta>0 then 'earned' else 'adjustment' end,left(coalesce(p_note,''),500),auth.uid(),p_request_id) returning id into v_existing.id;
 return jsonb_build_object('replayed',false,'points_balance',v_balance,'transaction_id',v_existing.id);
end $$;
create or replace function public.owner_create_invoice(p_order_id uuid,p_due_date date,p_notes text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_order public.store_orders%rowtype;declare v_invoice public.store_invoices%rowtype;declare v_items jsonb;
begin
 if not(private.is_approved_owner() or private.has_staff_permission('invoices','create')) then raise exception 'permission_denied';end if;
 if p_order_id is null then raise exception 'order_required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_order_id::text,0));
 select * into v_invoice from public.store_invoices where order_id=p_order_id;if found then return jsonb_build_object('created',false,'invoice',to_jsonb(v_invoice));end if;
 select * into v_order from public.store_orders where id=p_order_id;if not found then raise exception 'order_not_found';end if;
 select coalesce(jsonb_agg(jsonb_build_object('product_name',i.product_name,'sku',i.sku,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total) order by i.created_at),'[]'::jsonb) into v_items from public.store_order_items i where i.order_id=p_order_id;
 insert into public.store_invoices(order_id,status,due_date,subtotal,delivery_fee,total,customer_snapshot,items_snapshot,notes,created_by)
 values(p_order_id,'issued',p_due_date,v_order.subtotal,v_order.delivery_fee,v_order.total,jsonb_build_object('name',v_order.customer_name,'email',v_order.email,'phone',v_order.phone,'address',v_order.shipping_address),v_items,left(coalesce(p_notes,''),1000),auth.uid()) returning * into v_invoice;
 return jsonb_build_object('created',true,'invoice',to_jsonb(v_invoice));
end $$;
create or replace function public.owner_set_payment_record_status(p_payment_id uuid,p_status text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_payment public.store_payment_records%rowtype;declare v_total numeric;declare v_verified numeric;declare v_result text;
begin
 if not(private.is_approved_owner() or private.has_staff_permission('payments','update')) then raise exception 'permission_denied';end if;
 if p_status not in('pending','verified','rejected','refunded') then raise exception 'invalid_payment_status';end if;
 select * into v_payment from public.store_payment_records where id=p_payment_id for update;if not found then raise exception 'payment_not_found';end if;
 update public.store_payment_records set status=p_status,notes=coalesce(left(p_notes,1000),notes),verified_by=case when p_status='verified' then auth.uid() else verified_by end,verified_at=case when p_status='verified' then now() else verified_at end,updated_at=now() where id=p_payment_id returning * into v_payment;
 select total into v_total from public.store_orders where id=v_payment.order_id for update;
 select coalesce(sum(amount),0) into v_verified from public.store_payment_records where order_id=v_payment.order_id and status='verified';
 if v_verified>=v_total then v_result:='paid';update public.store_orders set payment_status='paid',updated_at=now() where id=v_payment.order_id;update public.store_invoices set status='paid',updated_at=now() where order_id=v_payment.order_id and status<>'void';else v_result:='pending';end if;
 return jsonb_build_object('payment',to_jsonb(v_payment),'verified_total',v_verified,'order_payment_status',v_result);
end $$;
revoke all on function public.owner_adjust_loyalty_points(uuid,integer,text,uuid) from public,anon;
grant execute on function public.owner_adjust_loyalty_points(uuid,integer,text,uuid) to authenticated;
revoke all on function public.owner_create_invoice(uuid,date,text) from public,anon;
grant execute on function public.owner_create_invoice(uuid,date,text) to authenticated;
revoke all on function public.owner_set_payment_record_status(uuid,text,text) from public,anon;
grant execute on function public.owner_set_payment_record_status(uuid,text,text) to authenticated;
