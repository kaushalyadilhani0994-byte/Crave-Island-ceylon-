create sequence if not exists public.store_invoice_number_seq start with 1001;
create table if not exists public.store_settings (
 id boolean primary key default true check(id=true),
 store_name text not null default 'CRAVE ISLAND CEYLON',
 tagline text not null default 'Ceylon · Crafted with a Story',
 support_email text, whatsapp_number text,
 delivery_fee numeric(12,2) not null default 0 check(delivery_fee>=0),
 delivery_zones jsonb not null default '[]'::jsonb,
 cod_enabled boolean not null default true,
 online_payments_enabled boolean not null default false,
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values(true) on conflict(id) do nothing;
create table if not exists public.customer_reviews (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 order_id uuid not null references public.store_orders(id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 review_text text not null check(length(trim(review_text)) between 5 and 3000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 is_verified boolean not null default false,
 moderation_note text,
 moderated_by uuid references auth.users(id) on delete set null,
 moderated_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(order_id,customer_id)
);
create index if not exists customer_reviews_status_created_idx on public.customer_reviews(status,created_at desc);
create table if not exists public.loyalty_accounts (
 customer_id uuid primary key references auth.users(id) on delete cascade,
 points_balance integer not null default 0 check(points_balance>=0),
 lifetime_points integer not null default 0 check(lifetime_points>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_transactions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references auth.users(id) on delete cascade,
 points_delta integer not null check(points_delta<>0),
 event_type text not null check(event_type in ('earned','redeemed','adjustment','expired','refund')),
 reference_id text,
 note text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists loyalty_transactions_customer_created_idx on public.loyalty_transactions(customer_id,created_at desc);
create table if not exists public.loyalty_rewards (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 160),
 description text, points_cost integer not null check(points_cost>0),
 stock_quantity integer not null default 0 check(stock_quantity>=0),
 is_active boolean not null default false,
 starts_at timestamptz, ends_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table if not exists public.scratch_campaigns (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 160),
 description text, reward_label text not null,
 starts_at timestamptz, ends_at timestamptz,
 max_claims integer check(max_claims is null or max_claims>0),
 claim_count integer not null default 0 check(claim_count>=0),
 is_active boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table if not exists public.scratch_claims (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.scratch_campaigns(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete cascade,
 reward_label text not null, claimed_at timestamptz not null default now(),
 unique(campaign_id,customer_id)
);
create table if not exists public.store_invoices (
 id uuid primary key default gen_random_uuid(),
 invoice_number text not null unique default('CIC-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.store_invoice_number_seq')::text,6,'0')),
 order_id uuid not null references public.store_orders(id) on delete restrict,
 status text not null default 'issued' check(status in ('draft','issued','paid','void')),
 issue_date date not null default current_date, due_date date,
 subtotal numeric(12,2) not null check(subtotal>=0),
 delivery_fee numeric(12,2) not null default 0 check(delivery_fee>=0),
 tax_amount numeric(12,2) not null default 0 check(tax_amount>=0),
 total numeric(12,2) not null check(total>=0),
 customer_snapshot jsonb not null, items_snapshot jsonb not null,
 notes text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(order_id)
);
create index if not exists store_invoices_status_created_idx on public.store_invoices(status,created_at desc);
create table if not exists public.store_payment_records (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.store_orders(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),
 payment_method text not null check(payment_method in ('bank_transfer','cash_on_delivery','card_manual','other')),
 status text not null default 'pending' check(status in ('pending','verified','rejected','refunded')),
 reference_number text, proof_url text, notes text,
 verified_by uuid references auth.users(id) on delete set null,
 verified_at timestamptz, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists store_payment_records_order_idx on public.store_payment_records(order_id,created_at desc);
create table if not exists public.media_assets (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 2 and 180),
 asset_url text not null check(asset_url ~ '^https://'),
 asset_type text not null check(asset_type in ('image','video','document')),
 caption text, status text not null default 'draft' check(status in ('draft','approved','archived')),
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.staff_tasks (
 id uuid primary key default gen_random_uuid(),
 assigned_to uuid references public.staff_profiles(id) on delete set null,
 title text not null check(length(trim(title)) between 2 and 180),
 description text, priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','in_progress','blocked','done','cancelled')),
 due_at timestamptz, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists staff_tasks_assigned_status_idx on public.staff_tasks(assigned_to,status,due_at);
create or replace function public.cic_set_updated_at() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin new.updated_at:=now();return new;end $$;
do $$ declare t text; begin foreach t in array array['store_settings','customer_reviews','loyalty_accounts','loyalty_rewards','scratch_campaigns','store_invoices','store_payment_records','media_assets','staff_tasks'] loop
 execute format('drop trigger if exists %I on public.%I','cic_updated_at_'||t,t);
 execute format('create trigger %I before update on public.%I for each row execute function public.cic_set_updated_at()','cic_updated_at_'||t,t);
end loop;end $$;
create or replace function public.cic_mark_verified_review() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_customer uuid;declare v_status text;begin
 select o.customer_id,o.order_status into v_customer,v_status from public.store_orders o where o.id=new.order_id;
 if v_customer is null or v_customer<>new.customer_id or v_status<>'delivered' then raise exception 'verified_purchase_required';end if;
 new.is_verified:=true;new.status:='pending';return new;
end $$;
drop trigger if exists cic_verified_review_before_insert on public.customer_reviews;
create trigger cic_verified_review_before_insert before insert on public.customer_reviews for each row execute function public.cic_mark_verified_review();
alter table public.store_settings enable row level security;
alter table public.customer_reviews enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.scratch_campaigns enable row level security;
alter table public.scratch_claims enable row level security;
alter table public.store_invoices enable row level security;
alter table public.store_payment_records enable row level security;
alter table public.media_assets enable row level security;
alter table public.staff_tasks enable row level security;
grant select,insert,update,delete on public.store_settings,public.customer_reviews,public.loyalty_accounts,public.loyalty_transactions,public.loyalty_rewards,public.scratch_campaigns,public.scratch_claims,public.store_invoices,public.store_payment_records,public.media_assets,public.staff_tasks to authenticated;
grant usage,select on sequence public.store_invoice_number_seq to authenticated;
create policy cic_owner_settings_all on public.store_settings for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('store_settings','read')) with check(private.is_approved_owner() or private.has_staff_permission('store_settings','update'));
create policy cic_customer_reviews_read on public.customer_reviews for select to authenticated using(customer_id=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('reviews','read'));
create policy cic_customer_reviews_insert on public.customer_reviews for insert to authenticated with check(customer_id=(select auth.uid()));
create policy cic_customer_reviews_moderate on public.customer_reviews for update to authenticated using(private.is_approved_owner() or private.has_staff_permission('reviews','update')) with check(private.is_approved_owner() or private.has_staff_permission('reviews','update'));
create policy cic_customer_reviews_delete on public.customer_reviews for delete to authenticated using(private.is_approved_owner() or private.has_staff_permission('reviews','delete'));
create policy cic_loyalty_accounts_read on public.loyalty_accounts for select to authenticated using(customer_id=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('loyalty','read'));
create policy cic_loyalty_accounts_write on public.loyalty_accounts for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','update')) with check(private.is_approved_owner() or private.has_staff_permission('loyalty','update'));
create policy cic_loyalty_transactions_read on public.loyalty_transactions for select to authenticated using(customer_id=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('loyalty','read'));
create policy cic_loyalty_transactions_insert on public.loyalty_transactions for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('loyalty','create'));
create policy cic_loyalty_rewards_all on public.loyalty_rewards for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('loyalty','read')) with check(private.is_approved_owner() or private.has_staff_permission('loyalty','update'));
create policy cic_scratch_campaigns_all on public.scratch_campaigns for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('scratch_cards','read')) with check(private.is_approved_owner() or private.has_staff_permission('scratch_cards','update'));
create policy cic_scratch_claims_read on public.scratch_claims for select to authenticated using(customer_id=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('scratch_cards','read'));
create policy cic_invoices_all on public.store_invoices for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('invoices','read')) with check(private.is_approved_owner() or private.has_staff_permission('invoices','create') or private.has_staff_permission('invoices','update'));
create policy cic_payments_all on public.store_payment_records for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('payments','read')) with check(private.is_approved_owner() or private.has_staff_permission('payments','create') or private.has_staff_permission('payments','update'));
create policy cic_media_all on public.media_assets for all to authenticated using(private.is_approved_owner() or private.has_staff_permission('media','read')) with check(private.is_approved_owner() or private.has_staff_permission('media','create') or private.has_staff_permission('media','update'));
create policy cic_tasks_read on public.staff_tasks for select to authenticated using(assigned_to=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('tasks','read'));
create policy cic_tasks_insert on public.staff_tasks for insert to authenticated with check(private.is_approved_owner() or private.has_staff_permission('tasks','create'));
create policy cic_tasks_update on public.staff_tasks for update to authenticated using(assigned_to=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('tasks','update')) with check(assigned_to=(select auth.uid()) or private.is_approved_owner() or private.has_staff_permission('tasks','update'));
create policy cic_tasks_delete on public.staff_tasks for delete to authenticated using(private.is_approved_owner() or private.has_staff_permission('tasks','delete'));
revoke all on public.store_settings,public.customer_reviews,public.loyalty_accounts,public.loyalty_transactions,public.loyalty_rewards,public.scratch_campaigns,public.scratch_claims,public.store_invoices,public.store_payment_records,public.media_assets,public.staff_tasks from anon;
