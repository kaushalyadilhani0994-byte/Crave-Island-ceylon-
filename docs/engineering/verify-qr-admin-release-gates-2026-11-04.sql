-- CRAVE ISLAND CEYLON — read-only release-gate verification
-- Run in Supabase SQL Editor AFTER reviewing/applying migrations 001–005.
-- Every statement below is SELECT-only; it does not modify production data.

-- 1) Browser roles must not retain table-level SELECT on products.
select grantee, privilege_type
from information_schema.table_privileges
where table_schema='public'
  and table_name='products'
  and grantee in ('anon','authenticated','PUBLIC')
order by grantee, privilege_type;

-- 2) Confirm the exact browser-visible product column allowlist.
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema='public'
  and table_name='products'
  and grantee in ('anon','authenticated')
  and privilege_type='SELECT'
order by grantee, ordinal_position;

-- 3) Confirm the owner and staff RPCs exist and have intended execute grants.
select
  p.oid::regprocedure as function_signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('owner_list_products','team_list_inventory'))
   or (n.nspname='private' and p.proname='owner_update_product_passport_impl')
order by 1;

-- 4) Confirm the passport net-content field and delivered timestamp migration.
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and ((table_name='product_passports' and column_name='net_content')
    or (table_name='store_orders' and column_name='delivered_at'))
order by table_name, column_name;

-- 5) Read-only production acceptance snapshot. No customer data is selected.
select 'categories' as item, count(*) as total,
       count(*) filter (where is_active is true) as active
from public.categories
union all
select 'products', count(*),
       count(*) filter (where is_active is true)
from public.products
union all
select 'published_passports', count(*),
       count(*) filter (where published is true)
from public.product_passports
union all
select 'orders', count(*), null::bigint
from public.store_orders;

-- Expected security interpretation:
-- * Query 1: no rows for anon/authenticated/PUBLIC.
-- * Query 2: only the reviewed storefront-safe column allowlist appears.
-- * Query 3: anon_can_execute=false for all listed functions;
--   authenticated_can_execute=true for owner_list_products and team_list_inventory;
--   authenticated_can_execute=true for the private implementation (per migration 005);
--   service_role_can_execute=false unless a separate explicit grant exists.
-- * Query 4: both migrated columns appear exactly once.
-- * Query 5: use the returned counts to confirm no draft product was accidentally published.
