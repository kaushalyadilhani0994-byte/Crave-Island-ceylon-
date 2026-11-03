-- CRAVE ISLAND CEYLON
-- Approved-owner product + QR passport RPCs.
-- Review branch only. Reconcile historical migrations and run isolated DB tests before production.
-- Product saves create hidden drafts and unpublished passports. Public publication is a separate action.

create table if not exists private.owner_product_save_requests (
  actor_user_id uuid not null,
  request_id uuid not null,
  request_payload jsonb not null,
  product_id uuid not null,
  qr_url text not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);

revoke all on table private.owner_product_save_requests from public, anon, authenticated;

create or replace function private.owner_save_product_passport_impl(
  p_product_id uuid,
  p_request_id uuid,
  p_payload jsonb,
  p_site_origin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_product public.products%rowtype;
  v_existing private.owner_product_save_requests%rowtype;
  v_product_id uuid;
  v_slug text;
  v_origin text;
  v_qr_url text;
  v_created boolean := false;
  v_stock integer;
  v_low_stock integer;
  v_price numeric;
  v_track boolean;
  v_ingredients text[];
  v_allergens text[];
begin
  if v_actor is null or not private.is_approved_owner() then
    raise exception 'approved_owner_required' using errcode = '42501';
  end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_product_save_request' using errcode = '22023';
  end if;
  v_origin := btrim(coalesce(p_site_origin, ''));
  if v_origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
     and v_origin !~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' then
    raise exception 'invalid_site_origin' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload->>'name'), '') is null
     or length(p_payload->>'name') > 180
     or nullif(btrim(p_payload->>'category'), '') is null
     or nullif(btrim(p_payload->>'ingredients'), '') is null
     or length(p_payload->>'ingredients') > 5000 then
    raise exception 'required_product_details_missing' using errcode = '22023';
  end if;
  begin
    v_price := (p_payload->>'price')::numeric;
    v_stock := coalesce((p_payload->>'stock_quantity')::integer, 0);
    v_low_stock := coalesce((p_payload->>'low_stock_threshold')::integer, 5);
    v_track := coalesce((p_payload->>'track_inventory')::boolean, false);
  exception when others then
    raise exception 'invalid_price_or_inventory_value' using errcode = '22023';
  end;
  if v_price <= 0 or v_price > 2000000 or v_stock < 0 or v_low_stock < 0
     or p_payload->>'currency' is distinct from 'LKR' then
    raise exception 'invalid_price_or_inventory_value' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.categories c
     where c.name = p_payload->>'category' and c.is_active is true
  ) then
    raise exception 'active_category_required' using errcode = '22023';
  end if;
  if nullif(p_payload->>'image_url','') is not null
     and p_payload->>'image_url' !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid_product_image_url' using errcode = '22023';
  end if;
  if nullif(p_payload->>'manufacturing_date','') is not null
     and (p_payload->>'manufacturing_date')::date > (now() at time zone 'Asia/Colombo')::date then
    raise exception 'manufacturing_date_cannot_be_in_future' using errcode = '22023';
  end if;
  if nullif(p_payload->>'manufacturing_date','') is not null
     and nullif(p_payload->>'expiry_date','') is not null
     and (p_payload->>'manufacturing_date')::date > (p_payload->>'expiry_date')::date then
    raise exception 'invalid_product_date_range' using errcode = '22023';
  end if;
  if nullif(p_payload->>'expiry_date','') is not null
     and (p_payload->>'expiry_date')::date < (now() at time zone 'Asia/Colombo')::date then
    raise exception 'expired_product_cannot_be_saved' using errcode = '22023';
  end if;

  -- Serialize duplicate/retried requests for the same owner and request UUID.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text || ':' || p_request_id::text, 0)
  );
  select * into v_existing
    from private.owner_product_save_requests
   where actor_user_id = v_actor and request_id = p_request_id;
  if found then
    if v_existing.request_payload is distinct from (p_payload || jsonb_build_object('_site_origin', v_origin)) then
      raise exception 'idempotency_key_reused_with_different_payload' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'product_id', v_existing.product_id,
      'qr_url', v_existing.qr_url,
      'created', false,
      'replayed', true
    );
  end if;

  if p_product_id is null then
    insert into public.products (
      name, description, category, price, currency, image_url, ingredients,
      allergen_information, batch_number, qr_code, is_active, stock_quantity,
      low_stock_threshold, track_inventory, expiry_date, manufacturing_date,
      storage_location, updated_at
    ) values (
      btrim(p_payload->>'name'),
      nullif(btrim(p_payload->>'description'), ''),
      btrim(p_payload->>'category'),
      v_price, 'LKR',
      nullif(btrim(p_payload->>'image_url'), ''),
      btrim(p_payload->>'ingredients'),
      nullif(btrim(p_payload->>'allergen_information'), ''),
      nullif(btrim(p_payload->>'batch_number'), ''),
      null, false, v_stock, v_low_stock, v_track,
      nullif(p_payload->>'expiry_date','')::date,
      nullif(p_payload->>'manufacturing_date','')::date,
      nullif(btrim(p_payload->>'storage_location'), ''),
      now()
    ) returning id into v_product_id;
    v_created := true;
  else
    select * into v_product from public.products where id = p_product_id for update;
    if not found then raise exception 'product_not_found' using errcode = 'P0002'; end if;
    update public.products set
      name=btrim(p_payload->>'name'),
      description=nullif(btrim(p_payload->>'description'),''),
      category=btrim(p_payload->>'category'),
      price=v_price, currency='LKR',
      image_url=nullif(btrim(p_payload->>'image_url'),''),
      ingredients=btrim(p_payload->>'ingredients'),
      allergen_information=nullif(btrim(p_payload->>'allergen_information'),''),
      batch_number=nullif(btrim(p_payload->>'batch_number'),''),
      stock_quantity=v_stock, low_stock_threshold=v_low_stock,
      track_inventory=v_track,
      expiry_date=nullif(p_payload->>'expiry_date','')::date,
      manufacturing_date=nullif(p_payload->>'manufacturing_date','')::date,
      storage_location=nullif(btrim(p_payload->>'storage_location'),''),
      updated_at=now()
    where id=p_product_id;
    v_product_id := p_product_id;
  end if;

  select pp.public_slug into v_slug
    from public.product_passports pp
   where pp.product_id = v_product_id::text
   for update;
  if v_slug is null then
    v_slug := replace(gen_random_uuid()::text, '-', '');
    v_ingredients := regexp_split_to_array(btrim(p_payload->>'ingredients'), '[,;\n]+');
    select coalesce(array_agg(btrim(x) order by ord), '{}'::text[])
      into v_ingredients
      from unnest(v_ingredients) with ordinality as t(x,ord)
     where btrim(x) <> '';
    v_allergens := case
      when nullif(btrim(p_payload->>'allergen_information'),'') is null then '{}'::text[]
      else regexp_split_to_array(btrim(p_payload->>'allergen_information'), '[,;\n]+')
    end;
    insert into public.product_passports (
      product_id, public_slug, ingredients, allergen_information, batch_code,
      manufacturing_date, best_before, published, updated_at
    ) values (
      v_product_id::text, v_slug, v_ingredients, v_allergens,
      nullif(btrim(p_payload->>'batch_number'),''),
      nullif(p_payload->>'manufacturing_date','')::date,
      nullif(p_payload->>'expiry_date','')::date,
      false, now()
    );
  end if;
  v_qr_url := v_origin || '/passport.html?slug=' || v_slug;
  update public.products set qr_code=v_qr_url, updated_at=now() where id=v_product_id;

  insert into private.owner_product_save_requests (
    actor_user_id, request_id, request_payload, product_id, qr_url
  ) values (v_actor, p_request_id, p_payload || jsonb_build_object('_site_origin', v_origin), v_product_id, v_qr_url);

  return jsonb_build_object(
    'product_id', v_product_id,
    'qr_url', v_qr_url,
    'created', v_created,
    'replayed', false
  );
end;
$function$;

revoke all on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) from public, anon;
grant execute on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) to authenticated;

create or replace function public.owner_save_product_passport(
  p_product_id uuid,
  p_request_id uuid,
  p_payload jsonb,
  p_site_origin text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.owner_save_product_passport_impl(
    p_product_id, p_request_id, p_payload, p_site_origin
  );
$wrapper$;

revoke all on function public.owner_save_product_passport(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.owner_save_product_passport(uuid,uuid,jsonb,text) to authenticated;

create or replace function private.owner_update_product_passport_impl(
  p_product_id uuid,
  p_payload jsonb,
  p_site_origin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product public.products%rowtype;
  v_passport public.product_passports%rowtype;
  v_slug text;
  v_origin text;
  v_qr_url text;
  v_ingredients text[];
  v_allergens text[];
  v_mfg date;
  v_best date;
begin
  if auth.uid() is null or not private.is_approved_owner() then
    raise exception 'approved_owner_required' using errcode = '42501';
  end if;
  if p_product_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_passport_request' using errcode = '22023';
  end if;
  v_origin := btrim(coalesce(p_site_origin, ''));
  if v_origin !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
     and v_origin !~ '^http://(localhost|127[.]0[.]0[.]1)(:[0-9]{1,5})?$' then
    raise exception 'invalid_site_origin' using errcode = '22023';
  end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found then raise exception 'product_not_found' using errcode = 'P0002'; end if;
  if jsonb_typeof(p_payload->'ingredients') <> 'array'
     or jsonb_typeof(p_payload->'allergen_information') <> 'array' then
    raise exception 'passport_ingredients_and_allergens_must_be_arrays' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(value) order by ord), '{}'::text[])
    into v_ingredients
    from jsonb_array_elements_text(p_payload->'ingredients') with ordinality as t(value,ord)
   where btrim(value) <> '';
  select coalesce(array_agg(btrim(value) order by ord), '{}'::text[])
    into v_allergens
    from jsonb_array_elements_text(p_payload->'allergen_information') with ordinality as t(value,ord)
   where btrim(value) <> '';
  if cardinality(v_ingredients)=0 or array_length(v_ingredients,1)>100
     or exists(select 1 from unnest(v_ingredients) x where length(x)>300)
     or array_length(v_allergens,1)>100
     or exists(select 1 from unnest(v_allergens) x where length(x)>300) then
    raise exception 'invalid_passport_ingredient_or_allergen_list' using errcode = '22023';
  end if;
  v_mfg := nullif(p_payload->>'manufacturing_date','')::date;
  v_best := nullif(p_payload->>'best_before','')::date;
  if v_mfg is not null and v_mfg > (now() at time zone 'Asia/Colombo')::date then
    raise exception 'manufacturing_date_cannot_be_in_future' using errcode = '22023';
  end if;
  if v_mfg is not null and v_best is not null and v_mfg > v_best then
    raise exception 'invalid_product_date_range' using errcode = '22023';
  end if;
  if coalesce((p_payload->>'published')::boolean,false) and v_product.is_active is not true then
    raise exception 'activate_product_before_publishing_passport' using errcode = '22023';
  end if;

  select * into v_passport
    from public.product_passports
   where product_id=p_product_id::text
   for update;
  if found then
    v_slug := v_passport.public_slug;
    update public.product_passports set
      ingredients=v_ingredients,
      allergen_information=v_allergens,
      origin=nullif(btrim(p_payload->>'origin'),''),
      batch_code=nullif(btrim(p_payload->>'batch_code'),''),
      manufacturing_date=v_mfg,
      best_before=v_best,
      storage_instructions=nullif(btrim(p_payload->>'storage_instructions'),''),
      public_story=nullif(btrim(p_payload->>'public_story'),''),
      published=coalesce((p_payload->>'published')::boolean,false),
      updated_at=now()
    where product_id=p_product_id::text;
  else
    v_slug := replace(gen_random_uuid()::text, '-', '');
    insert into public.product_passports (
      product_id, public_slug, ingredients, allergen_information, origin,
      batch_code, manufacturing_date, best_before, storage_instructions,
      public_story, published, updated_at
    ) values (
      p_product_id::text, v_slug, v_ingredients, v_allergens,
      nullif(btrim(p_payload->>'origin'),''),
      nullif(btrim(p_payload->>'batch_code'),''),
      v_mfg, v_best,
      nullif(btrim(p_payload->>'storage_instructions'),''),
      nullif(btrim(p_payload->>'public_story'),''),
      coalesce((p_payload->>'published')::boolean,false), now()
    );
  end if;
  v_qr_url := v_origin || '/passport.html?slug=' || v_slug;
  update public.products set qr_code=v_qr_url, updated_at=now() where id=p_product_id;
  return jsonb_build_object(
    'product_id', p_product_id,
    'qr_url', v_qr_url,
    'published', coalesce((p_payload->>'published')::boolean,false)
  );
end;
$function$;

revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public, anon;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;

create or replace function public.owner_update_product_passport(
  p_product_id uuid,
  p_payload jsonb,
  p_site_origin text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $wrapper$
  select private.owner_update_product_passport_impl(
    p_product_id, p_payload, p_site_origin
  );
$wrapper$;

revoke all on function public.owner_update_product_passport(uuid,jsonb,text) from public, anon;
grant execute on function public.owner_update_product_passport(uuid,jsonb,text) to authenticated;

comment on function public.owner_save_product_passport(uuid,uuid,jsonb,text) is
  'Creates or updates an approved-owner product draft and its unpublished QR passport atomically with request replay protection.';
comment on function public.owner_update_product_passport(uuid,jsonb,text) is
  'Updates a product QR passport for the approved owner and returns its public passport URL.';
