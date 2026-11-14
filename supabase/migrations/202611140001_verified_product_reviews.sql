-- Verified-purchase product reviews with owner moderation.
-- Public clients never receive order IDs, customer IDs, or pending/rejected content.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  order_id uuid not null references public.store_orders(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  title text not null check (char_length(btrim(title)) between 3 and 100),
  review_body text not null check (char_length(btrim(review_body)) between 10 and 2000),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  constraint product_reviews_one_per_order_product unique (order_id, product_id)
);

create index if not exists product_reviews_public_product_idx
  on public.product_reviews (product_id, created_at desc)
  where moderation_status = 'approved';
create index if not exists product_reviews_pending_idx
  on public.product_reviews (created_at asc)
  where moderation_status = 'pending';

alter table public.product_reviews enable row level security;
revoke all on table public.product_reviews from anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function public.get_public_product_reviews(
  p_product_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  review_id uuid,
  product_id uuid,
  product_name text,
  rating smallint,
  review_title text,
  review_body text,
  created_at timestamptz,
  verified_purchase boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.id, r.product_id, p.name, r.rating, r.title, r.review_body,
         r.created_at, true
  from public.product_reviews r
  join public.products p on p.id = r.product_id
  where r.moderation_status = 'approved'
    and p.is_active is true
    and (p_product_id is null or r.product_id = p_product_id)
  order by r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit,20),50))
  offset greatest(0, least(coalesce(p_offset,0),500));
$function$;

create or replace function public.submit_verified_product_review(
  p_order_number text,
  p_product_id uuid,
  p_rating integer,
  p_title text,
  p_review_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'CUSTOMER_SIGN_IN_REQUIRED' using errcode='42501';
  end if;
  if p_order_number is null or length(btrim(p_order_number)) not between 4 and 40
     or p_product_id is null
     or p_rating is null or p_rating < 1 or p_rating > 5
     or p_title is null or char_length(btrim(p_title)) not between 3 and 100
     or p_review_body is null or char_length(btrim(p_review_body)) not between 10 and 2000 then
    raise exception 'INVALID_REVIEW_INPUT' using errcode='22023';
  end if;

  select o.id into v_order_id
  from public.store_orders o
  join public.store_order_items i on i.order_id = o.id
  where upper(o.order_number) = upper(btrim(p_order_number))
    and o.customer_id = v_uid
    and o.order_status = 'delivered'
    and o.delivered_at is not null
    and i.product_id = p_product_id::text
  limit 1;

  if v_order_id is null then
    raise exception 'VERIFIED_DELIVERED_PURCHASE_REQUIRED' using errcode='42501';
  end if;

  insert into public.product_reviews (
    product_id, order_id, customer_id, rating, title, review_body
  ) values (
    p_product_id, v_order_id, v_uid, p_rating, btrim(p_title), btrim(p_review_body)
  );

  return jsonb_build_object('ok', true, 'status', 'pending_owner_approval');
exception
  when unique_violation then
    raise exception 'REVIEW_ALREADY_SUBMITTED_FOR_THIS_ORDER' using errcode='23505';
end;
$function$;

create or replace function public.owner_list_product_reviews(p_status text default 'pending')
returns table (
  review_id uuid,
  product_id uuid,
  product_name text,
  order_number text,
  rating smallint,
  review_title text,
  review_body text,
  created_at timestamptz,
  moderation_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_approved_owner() then
    raise exception 'APPROVED_OWNER_REQUIRED' using errcode='42501';
  end if;
  if p_status not in ('pending','approved','rejected','all') then
    raise exception 'INVALID_REVIEW_STATUS' using errcode='22023';
  end if;
  return query
    select r.id, r.product_id, p.name, o.order_number, r.rating,
           r.title, r.review_body, r.created_at, r.moderation_status
    from public.product_reviews r
    join public.products p on p.id=r.product_id
    join public.store_orders o on o.id=r.order_id
    where p_status='all' or r.moderation_status=p_status
    order by case when r.moderation_status='pending' then 0 else 1 end,
             r.created_at asc;
end;
$function$;

create or replace function public.owner_moderate_product_review(
  p_review_id uuid,
  p_next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not private.is_approved_owner() then
    raise exception 'APPROVED_OWNER_REQUIRED' using errcode='42501';
  end if;
  if p_review_id is null or p_next_status not in ('approved','rejected') then
    raise exception 'INVALID_REVIEW_MODERATION' using errcode='22023';
  end if;
  update public.product_reviews
  set moderation_status=p_next_status,
      moderated_at=now(),
      moderated_by=auth.uid()
  where id=p_review_id;
  if not found then
    raise exception 'REVIEW_NOT_FOUND' using errcode='P0002';
  end if;
  return jsonb_build_object('ok',true,'status',p_next_status);
end;
$function$;

revoke all on function public.get_public_product_reviews(uuid,integer,integer) from public;
revoke all on function public.submit_verified_product_review(text,uuid,integer,text,text) from public;
revoke all on function public.owner_list_product_reviews(text) from public;
revoke all on function public.owner_moderate_product_review(uuid,text) from public;
grant execute on function public.get_public_product_reviews(uuid,integer,integer) to anon, authenticated;
grant execute on function public.submit_verified_product_review(text,uuid,integer,text,text) to authenticated;
grant execute on function public.owner_list_product_reviews(text) to authenticated;
grant execute on function public.owner_moderate_product_review(uuid,text) to authenticated;
