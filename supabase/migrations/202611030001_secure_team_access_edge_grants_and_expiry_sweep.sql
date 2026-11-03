-- CRAVE ISLAND CEYLON
-- Review branch only. This migration is NOT applied to production.
-- Repairs team-access mutation, narrowly grants the Edge Function writes they perform,
-- removes accounts-only access to raw customer order rows, and adds a daily Colombo expiry sweep.

-- 1) Narrow service_role write privileges to the exact columns used by trusted Edge Functions.
grant update (stock_quantity, low_stock_threshold, track_inventory, expiry_date, updated_at)
  on table public.products to service_role;
grant update (order_status)
  on table public.store_orders to service_role;
grant insert (id, email, display_name, role, approved, permissions)
  on table public.staff_profiles to service_role;
grant update (email, display_name, role, approved, permissions)
  on table public.staff_profiles to service_role;

-- Order creation is performed only by the SECURITY DEFINER atomic RPC.
-- No direct service_role INSERT/DELETE grants are added to orders or order items.

-- 2) Accounts-only team members must not receive raw customer PII through order tables.
drop policy if exists "Team permitted read orders" on public.store_orders;
create policy "Team permitted read orders"
on public.store_orders
for select
to authenticated
using (
  private.has_staff_permission('orders', 'read')
  or private.has_staff_permission('dispatch', 'read')
);

drop policy if exists "Team permitted read order items" on public.store_order_items;
create policy "Team permitted read order items"
on public.store_order_items
for select
to authenticated
using (
  private.has_staff_permission('orders', 'read')
  or private.has_staff_permission('dispatch', 'read')
);

-- Accounts users should receive a future narrow invoice/payment projection, not these raw rows.

-- 3) Secure team permission updates without granting direct UPDATE on staff_profiles.
create table if not exists private.staff_access_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  old_role text,
  new_role text not null,
  old_approved boolean,
  new_approved boolean not null,
  old_permissions jsonb not null,
  new_permissions jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on table private.staff_access_audit from public, anon, authenticated, service_role;

create or replace function private.owner_set_team_member_access_impl(
  _user_id uuid,
  _role text,
  _approved boolean,
  _permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target public.staff_profiles%rowtype;
  v_permissions jsonb := coalesce(_permissions, '{}'::jsonb);
  v_module text;
  v_actions jsonb;
  v_action text;
  v_allowed_modules text[] := array[
    'catalogue','inventory','orders','dispatch','media','accounts',
    'star_club','certificates','reports','tasks','settings'
  ];
  v_allowed_actions text[] := array['read','create','update','delete','approve','export'];
begin
  if v_actor is null or not private.is_approved_owner() then
    raise exception 'owner_access_required' using errcode = '42501';
  end if;

  if _user_id is null
     or _role is null
     or _role not in ('supervisor','staff','media','accounts','star_club')
     or _approved is null
     or jsonb_typeof(v_permissions) <> 'object' then
    raise exception 'invalid_team_member_or_permissions' using errcode = '22023';
  end if;

  for v_module, v_actions in
    select key, value from jsonb_each(v_permissions)
  loop
    if not (v_module = any(v_allowed_modules)) or jsonb_typeof(v_actions) <> 'array' then
      raise exception 'invalid_permission_module' using errcode = '22023';
    end if;

    for v_action in select jsonb_array_elements_text(v_actions)
    loop
      if not (v_action = any(v_allowed_actions)) then
        raise exception 'invalid_permission_action' using errcode = '22023';
      end if;
    end loop;

    if exists (
      select 1
      from jsonb_array_elements(v_actions) as a(value)
      where jsonb_typeof(a.value) <> 'string'
    ) then
      raise exception 'permission_actions_must_be_strings' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(v_actions) as a(action)
      where a.action <> 'read'
    ) and not (v_actions ? 'read') then
      raise exception 'read_permission_required_for_other_actions' using errcode = '22023';
    end if;
  end loop;

  select * into v_target
  from public.staff_profiles
  where id = _user_id
  for update;

  if not found or v_target.role = 'owner' then
    raise exception 'team_member_not_found_or_owner' using errcode = 'P0002';
  end if;

  update public.staff_profiles
     set role = _role,
         approved = _approved,
         permissions = v_permissions
   where id = _user_id;

  insert into private.staff_access_audit (
    actor_user_id, target_user_id,
    old_role, new_role, old_approved, new_approved,
    old_permissions, new_permissions
  ) values (
    v_actor, _user_id,
    v_target.role, _role, v_target.approved, _approved,
    coalesce(v_target.permissions, '{}'::jsonb), v_permissions
  );
end;
$function$;

revoke all on function private.owner_set_team_member_access_impl(uuid,text,boolean,jsonb)
  from public, anon;
grant execute on function private.owner_set_team_member_access_impl(uuid,text,boolean,jsonb)
  to authenticated;

create or replace function public.owner_set_team_member_access(
  _user_id uuid,
  _role text,
  _approved boolean,
  _permissions jsonb
)
returns void
language plpgsql
security invoker
set search_path = 'pg_catalog','public','private'
as $function$
begin
  perform private.owner_set_team_member_access_impl(_user_id, _role, _approved, _permissions);
end;
$function$;

revoke all on function public.owner_set_team_member_access(uuid,text,boolean,jsonb)
  from public, anon;
grant execute on function public.owner_set_team_member_access(uuid,text,boolean,jsonb)
  to authenticated;

-- 4) Make trigger-driven expiry alerts use the Sri Lanka business date.
create or replace function public.refresh_product_inventory_alerts()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Colombo')::date;
begin
  if coalesce(new.track_inventory, false) then
    if coalesce(new.stock_quantity, 0) <= 0 then
      insert into public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
      values ('stock:' || new.id::text, 'out_of_stock', 'critical', 'Out of stock: ' || new.name,
              'Stock for ' || new.name || ' is zero or below. Replenish or hide this product.',
              'product', new.id::text, 'open', now())
      on conflict (dedupe_key) do update set status='open', severity='critical', title=excluded.title, message=excluded.message, updated_at=now();
    elsif new.stock_quantity <= greatest(coalesce(new.low_stock_threshold,5),0) then
      insert into public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
      values ('stock:' || new.id::text, 'low_stock', 'warning', 'Low stock: ' || new.name,
              'Only ' || new.stock_quantity::text || ' units remain for ' || new.name || '. Check expected demand and replenish.',
              'product', new.id::text, 'open', now())
      on conflict (dedupe_key) do update set status='open', severity='warning', title=excluded.title, message=excluded.message, updated_at=now();
    else
      update public.admin_alerts set status='resolved', updated_at=now()
      where dedupe_key='stock:' || new.id::text and status <> 'resolved';
    end if;
  end if;

  if new.expiry_date is not null and new.expiry_date <= v_today + 30 then
    insert into public.admin_alerts(dedupe_key, alert_type, severity, title, message, entity_type, entity_id, status, updated_at)
    values ('expiry:' || new.id::text, 'expiry',
            case when new.expiry_date < v_today then 'critical'
                 when new.expiry_date <= v_today + 7 then 'critical'
                 else 'warning' end,
            case when new.expiry_date < v_today then 'Expired product: ' || new.name
                 else 'Expiry approaching: ' || new.name end,
            'Recorded expiry date: ' || new.expiry_date::text || '. Review this batch before sale.',
            'product', new.id::text, 'open', now())
    on conflict (dedupe_key) do update set status='open', severity=excluded.severity, title=excluded.title, message=excluded.message, updated_at=now();
  else
    update public.admin_alerts set status='resolved', updated_at=now()
    where dedupe_key='expiry:' || new.id::text and status <> 'resolved';
  end if;
  return new;
end;
$function$;

-- Daily sweep catches unchanged products as their expiry dates cross 30/7-day thresholds.
create or replace function public.sweep_product_expiry_alerts()
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Colombo')::date;
  v_count integer := 0;
begin
  insert into public.admin_alerts(
    dedupe_key, alert_type, severity, title, message,
    entity_type, entity_id, status, updated_at
  )
  select
    'expiry:' || p.id::text,
    'expiry',
    case when p.expiry_date < v_today or p.expiry_date <= v_today + 7 then 'critical' else 'warning' end,
    case when p.expiry_date < v_today then 'Expired product: ' || p.name else 'Expiry approaching: ' || p.name end,
    'Recorded expiry date: ' || p.expiry_date::text || '. Review this batch before sale.',
    'product',
    p.id::text,
    'open',
    now()
  from public.products p
  where p.expiry_date is not null
    and p.expiry_date <= v_today + 30
  on conflict (dedupe_key) do update
    set status='open', severity=excluded.severity,
        title=excluded.title, message=excluded.message, updated_at=now();

  get diagnostics v_count = row_count;

  update public.admin_alerts a
     set status='resolved', updated_at=now()
   where a.alert_type='expiry'
     and a.status <> 'resolved'
     and not exists (
       select 1
       from public.products p
       where a.dedupe_key='expiry:' || p.id::text
         and p.expiry_date is not null
         and p.expiry_date <= v_today + 30
     );

  return v_count;
end;
$function$;

revoke all on function public.sweep_product_expiry_alerts() from public, anon, authenticated, service_role;

-- Run at 00:15 Asia/Colombo (18:45 UTC), after the daily owner summary time.
select cron.unschedule(jobid)
from cron.job
where jobname = 'crave-daily-product-expiry-sweep';

select cron.schedule(
  'crave-daily-product-expiry-sweep',
  '45 18 * * *',
  'select public.sweep_product_expiry_alerts();'
);
