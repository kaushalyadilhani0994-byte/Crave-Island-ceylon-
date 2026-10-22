-- CRAVE ISLAND CEYLON — production data foundation
-- Safe to apply more than once. This migration intentionally does not alter
-- the existing categories/products tables because their exact column types
-- have not yet been verified.
create extension if not exists pgcrypto;

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  email text,
  phone text not null,
  shipping_address jsonb not null,
  currency text not null default 'LKR' check (currency = 'LKR'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method text not null default 'cod'
    check (payment_method in ('cod','bank_transfer','online')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),
  order_status text not null default 'pending'
    check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  customer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

-- Product passport data is kept separate until the existing products.id type
-- is verified; product_id stores its string representation.
create table if not exists public.product_passports (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique,
  public_slug text not null unique,
  ingredients text[] not null default '{}',
  allergen_information text[] not null default '{}',
  origin text,
  batch_code text,
  best_before date,
  storage_instructions text,
  public_story text,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists store_orders_customer_created_idx
  on public.store_orders (customer_id, created_at desc);
create index if not exists store_orders_status_created_idx
  on public.store_orders (order_status, created_at desc);
create index if not exists store_order_items_order_idx
  on public.store_order_items (order_id);
create index if not exists product_passports_product_idx
  on public.product_passports (product_id);

alter table public.customer_profiles enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.product_passports enable row level security;

-- Customers may access only their own profile and orders.
-- Order creation is intentionally not allowed from the browser: a trusted
-- Edge Function must verify product prices/stock and calculate totals first.
drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own profile"
  on public.customer_profiles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Customers insert own profile" on public.customer_profiles;
create policy "Customers insert own profile"
  on public.customer_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Customers update own profile" on public.customer_profiles;
create policy "Customers update own profile"
  on public.customer_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Customers read own orders" on public.store_orders;
create policy "Customers read own orders"
  on public.store_orders for select to authenticated
  using (customer_id = (select auth.uid()));

drop policy if exists "Customers read own order items" on public.store_order_items;
create policy "Customers read own order items"
  on public.store_order_items for select to authenticated
  using (exists (
    select 1 from public.store_orders o
    where o.id = store_order_items.order_id
      and o.customer_id = (select auth.uid())
  ));

-- Only published passport records are public. Admin publishing should be
-- performed through a trusted backend/service role, never with a service key
-- embedded in the browser.
drop policy if exists "Anyone reads published product passports" on public.product_passports;
create policy "Anyone reads published product passports"
  on public.product_passports for select to anon, authenticated
  using (published = true);

-- No browser-side order insertion, public customer data access, or client-side
-- admin privileges are granted by this migration. Create orders only through
-- a trusted Edge Function/service-role backend after validating prices and stock.
