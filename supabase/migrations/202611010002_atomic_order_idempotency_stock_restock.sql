-- CRAVE ISLAND CEYLON
-- Atomic COD order creation, customer-scoped idempotency, and single-path cancellation restock.
-- REVIEW BRANCH ONLY. Do not apply to production until isolated PostgreSQL tests and owner approval.

alter table public.store_orders
  add column if not exists idempotency_key uuid,
  add column if not exists idempotency_payload_hash text,
  add column if not exists stock_restocked_at timestamptz;

create unique index if not exists store_orders_customer_idempotency_key_uidx
  on public.store_orders(customer_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.create_store_order_atomic(
  p_customer_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.store_orders%rowtype;
  v_hash text;
  v_name text;
  v_phone text;
  v_email text;
  v_address jsonb;
  v_note text;
  v_payment text;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_item jsonb;
  v_product public.products%rowtype;
  v_pid uuid;
  v_qty integer;
  v_line_total numeric(12,2);
  v_count integer := 0;
  v_order jsonb;
  v_saved_items jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_customer_id is null or p_idempotency_key is null
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid order request' using errcode='22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text || ':' || p_idempotency_key::text, 0));

  select * into v_existing
  from public.store_orders
  where customer_id=p_customer_id and idempotency_key=p_idempotency_key;

  if found then
    if v_existing.idempotency_payload_hash is distinct from v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    select jsonb_build_object(
      'id',o.id,'order_number',o.order_number,'subtotal',o.subtotal,
      'delivery_fee',o.delivery_fee,'total',o.total,'payment_method',o.payment_method,
      'payment_status',o.payment_status,'order_status',o.order_status,'created_at',o.created_at
    ) into v_order from public.store_orders o where o.id=v_existing.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,
      'unit_price',i.unit_price,'line_total',i.line_total
    ) order by i.created_at), '[]'::jsonb)
    into v_saved_items from public.store_order_items i where i.order_id=v_existing.id;
    return jsonb_build_object('order',v_order,'items',v_saved_items,'replayed',true);
  end if;

  v_name := nullif(btrim(p_payload->>'customer_name'),'');
  v_phone := nullif(btrim(p_payload->>'phone'),'');
  v_email := nullif(btrim(p_payload->>'email'),'');
  v_address := p_payload->'shipping_address';
  v_note := nullif(left(btrim(coalesce(p_payload->>'customer_note','')),500),'');
  v_payment := coalesce(p_payload->>'payment_method','');
  if v_name is null or length(v_name)>120 or v_phone is null or length(v_phone)>40
     or coalesce(jsonb_typeof(v_address),'')<>'object'
     or nullif(btrim(v_address->>'line1'),'') is null
     or nullif(btrim(v_address->>'city'),'') is null
     or nullif(btrim(v_address->>'district'),'') is null then
    raise exception 'Required customer and delivery details are missing' using errcode='22023';
  end if;
  if v_payment <> 'cod' then
    raise exception 'Only cash on delivery is currently available' using errcode='22023';
  end if;
  if coalesce(jsonb_typeof(p_payload->'items'),'') <> 'array' then
    raise exception 'Order items must be an array' using errcode='22023';
  end if;
  if jsonb_array_length(p_payload->'items') < 1 or jsonb_array_length(p_payload->'items') > 50 then
    raise exception 'Order must contain 1 to 50 product lines' using errcode='22023';
  end if;

  if (select count(*) from jsonb_array_elements(p_payload->'items') as item(value)) <>
     (select count(distinct lower(value->>'product_id')) from jsonb_array_elements(p_payload->'items') as item(value)) then
    raise exception 'Duplicate product lines are not allowed' using errcode='22023';
  end if;

  -- Lock all requested product rows in a stable order before checking stock/prices.
  perform p.id
  from public.products p
  join (
    select (item.value->>'product_id')::uuid as id
    from jsonb_array_elements(p_payload->'items') as item(value)
  ) requested on requested.id=p.id
  order by p.id
  for update of p;

  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    begin
      v_pid := (v_item->>'product_id')::uuid;
      v_qty := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Invalid product or quantity' using errcode='22023';
    end;
    if v_qty is null or v_qty<1 or v_qty>50 then
      raise exception 'Invalid product quantity' using errcode='22023';
    end if;

    select * into v_product from public.products where id=v_pid for update;
    if not found or v_product.is_active is not true
       or v_product.category is null
       or not exists(select 1 from public.categories c where c.name=v_product.category and c.is_active=true) then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode='P0002';
    end if;
    if v_product.expiry_date is not null and v_product.expiry_date<current_date then
      raise exception 'PRODUCT_EXPIRED' using errcode='P0002';
    end if;
    if v_product.currency<>'LKR' or v_product.price<=0 then
      raise exception 'INVALID_PRODUCT_PRICE' using errcode='22023';
    end if;
    if v_product.track_inventory and v_product.stock_quantity<v_qty then
      raise exception 'INSUFFICIENT_STOCK' using errcode='P0001';
    end if;

    v_line_total := round(v_product.price*v_qty,2);
    v_subtotal := v_subtotal+v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',v_product.id::text,
      'product_name',v_product.name,
      'quantity',v_qty,
      'unit_price',v_product.price,
      'line_total',v_line_total
    ));
    v_count := v_count+1;
  end loop;

  if v_count<>jsonb_array_length(p_payload->'items') or v_subtotal<=0 or v_subtotal>2000000 then
    raise exception 'Order total or product list is invalid' using errcode='22023';
  end if;

  v_order_number := 'CIC-' || to_char(now() at time zone 'UTC','YYYYMMDD') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

  insert into public.store_orders(
    order_number,customer_id,customer_name,email,phone,shipping_address,currency,
    subtotal,delivery_fee,total,payment_method,payment_status,order_status,customer_note,
    idempotency_key,idempotency_payload_hash
  ) values (
    v_order_number,p_customer_id,v_name,v_email,v_phone,
    jsonb_build_object(
      'line1',left(btrim(v_address->>'line1'),180),
      'line2',left(btrim(coalesce(v_address->>'line2','')),180),
      'city',left(btrim(v_address->>'city'),100),
      'district',left(btrim(v_address->>'district'),100),
      'postal_code',left(btrim(coalesce(v_address->>'postal_code','')),20),
      'country','Sri Lanka'
    ),
    'LKR',v_subtotal,0,v_subtotal,'cod','pending','pending',v_note,
    p_idempotency_key,v_hash
  ) returning id into v_order_id;

  insert into public.store_order_items(order_id,product_id,product_name,quantity,unit_price,line_total)
  select v_order_id,
         line.value->>'product_id',
         line.value->>'product_name',
         (line.value->>'quantity')::integer,
         (line.value->>'unit_price')::numeric,
         (line.value->>'line_total')::numeric
  from jsonb_array_elements(v_lines) as line(value);

  select jsonb_build_object('id',o.id,'order_number',o.order_number,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'payment_method',o.payment_method,'payment_status',o.payment_status,'order_status',o.order_status,'created_at',o.created_at) into v_order from public.store_orders o where o.id=v_order_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,
    'unit_price',i.unit_price,'line_total',i.line_total
  ) order by i.created_at), '[]'::jsonb)
  into v_saved_items from public.store_order_items i where i.order_id=v_order_id;

  return jsonb_build_object('order',v_order,'items',v_saved_items,'replayed',false);
end;
$function$;

revoke all on function public.create_store_order_atomic(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_store_order_atomic(uuid,uuid,jsonb) to service_role;

-- Make cancellation restock exactly once. A marker is committed with the stock updates.
create or replace function public.alert_order_issues()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
begin
  if new.payment_status='failed' then
    insert into public.admin_alerts(dedupe_key,alert_type,severity,title,message,entity_type,entity_id,status,updated_at)
    values ('order-payment-failed:'||new.id::text,'order_issue','critical',
      'Payment failed: '||coalesce(new.order_number,new.id::text),
      'A payment failure was recorded. Review the order and payment status.',
      'order',new.id::text,'open',now())
    on conflict (dedupe_key) do update set status='open',severity='critical',message=excluded.message,updated_at=now();
  end if;

  if new.order_status='cancelled' and old.order_status is distinct from 'cancelled' then
    insert into public.admin_alerts(dedupe_key,alert_type,severity,title,message,entity_type,entity_id,status,updated_at)
    values ('order-cancelled:'||new.id::text,'order_issue','warning',
      'Order cancelled: '||coalesce(new.order_number,new.id::text),
      'An order was cancelled. Review the order history and any stock/payment follow-up.',
      'order',new.id::text,'open',now())
    on conflict (dedupe_key) do update set status='open',severity='warning',updated_at=now();

    if new.stock_restocked_at is null then
      update public.products p
      set stock_quantity=p.stock_quantity+i.quantity,updated_at=now()
      from public.store_order_items i
      where i.order_id=new.id and p.track_inventory=true and p.id::text=i.product_id;
      update public.store_orders set stock_restocked_at=now()
      where id=new.id and stock_restocked_at is null;
    end if;
  end if;
  return new;
end;
$function$;

-- Item deletion is not a supported order-management action. Retain immutable order lines
-- so later maintenance/cascade deletion cannot credit already-restocked stock a second time.
drop trigger if exists store_order_items_inventory_delta on public.store_order_items;
create trigger store_order_items_inventory_decrement
  after insert on public.store_order_items
  for each row execute function public.apply_order_item_inventory_delta();
create or replace function public.prevent_store_order_item_delete()
returns trigger
language plpgsql
set search_path = 'pg_catalog','public'
as $function$
begin
  raise exception 'Order lines are immutable; cancel the order instead.' using errcode='55000';
end;
$function$;
drop trigger if exists store_order_items_no_delete on public.store_order_items;
create trigger store_order_items_no_delete
before delete on public.store_order_items
for each row execute function public.prevent_store_order_item_delete();
