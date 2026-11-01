-- CRAVE ISLAND CEYLON
-- Atomic owner-only product + passport + QR save.
-- Review branch only. Do not apply to production until staging tests and explicit approval.

create schema if not exists private;

create table if not exists private.owner_product_save_requests (
  owner_id uuid not null,
  request_id uuid not null,
  product_id uuid not null,
  request_payload jsonb not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, request_id)
);

revoke all on table private.owner_product_save_requests from public, anon, authenticated;

create or replace function public.owner_save_product_passport(
  p_product_id uuid,
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_owner_id uuid;
  v_existing private.owner_product_save_requests%rowtype;
  v_product_id uuid;
  v_slug text;
  v_qr_url text;
  v_name text;
  v_category text;
  v_price numeric;
  v_stock integer;
  v_threshold integer;
  v_mfg date;
  v_expiry date;
  v_track_inventory boolean;
  v_ingredients text[];
  v_allergens text[];
  v_result jsonb;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null or not private.is_approved_owner() then
    raise exception 'Approved owner access required' using errcode = '42501';
  end if;

  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A valid save request and product payload are required' using errcode = '22023';
  end if;

  -- Serialize simultaneous retries that carry the same owner/request key.
  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':' || p_request_id::text, 0));

  select * into v_existing
  from private.owner_product_save_requests
  where owner_id = v_owner_id and request_id = p_request_id;

  if found then
    if v_existing.request_payload <> p_payload
       or (p_product_id is not null and v_existing.product_id <> p_product_id) then
      raise exception 'This save request key was already used with different product details' using errcode = '22023';
    end if;
    return v_existing.result_payload || jsonb_build_object('replayed', true);
  end if;

  v_name := nullif(btrim(p_payload->>'name'), '');
  v_category := nullif(btrim(p_payload->>'category'), '');
  if v_name is null or length(v_name) > 160 or v_category is null or length(v_category) > 160 then
    raise exception 'Product name and active collection are required' using errcode = '22023';
  end if;

  begin
    v_price := (p_payload->>'price')::numeric;
    if coalesce(p_payload->>'stock_quantity', '0') !~ '^[0-9]{1,7}$'
       or coalesce(p_payload->>'low_stock_threshold', '5') !~ '^[0-9]{1,7}$' then
      raise exception 'Stock and threshold must be whole non-negative numbers';
    end if;
    v_stock := coalesce((p_payload->>'stock_quantity')::integer, 0);
    v_threshold := coalesce((p_payload->>'low_stock_threshold')::integer, 5);
    v_mfg := nullif(p_payload->>'manufacturing_date', '')::date;
    v_expiry := nullif(p_payload->>'expiry_date', '')::date;
    if coalesce(p_payload->>'track_inventory', 'false') not in ('true', 'false') then
      raise exception 'Inventory tracking must be true or false';
    end if;
    v_track_inventory := coalesce((p_payload->>'track_inventory')::boolean, false);
  exception when others then
    raise exception 'Price, stock, threshold, tracking, or date value is invalid' using errcode = '22023';
  end;

  if v_price is null or v_price <= 0 or v_price > 2000000 then
    raise exception 'Price must be a positive LKR amount within the permitted limit' using errcode = '22023';
  end if;
  if v_stock > 1000000 or v_threshold > 1000000 then
    raise exception 'Stock and low-stock threshold must not exceed 1000000' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload->>'ingredients'), '') is null then
    raise exception 'Verified ingredients are required' using errcode = '22023';
  end if;
  if v_mfg is not null and v_expiry is not null and v_mfg > v_expiry then
    raise exception 'Manufacturing date cannot be later than best-before date' using errcode = '22023';
  end if;
  if coalesce(p_payload->>'currency', 'LKR') <> 'LKR' then
    raise exception 'Only LKR currency is supported' using errcode = '22023';
  end if;
  if nullif(btrim(p_payload->>'image_url'), '') is not null
     and (p_payload->>'image_url') !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/|$|[?#])' then
    raise exception 'Product image must use an HTTPS URL' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.categories c
    where c.name = v_category and c.is_active is true
  ) then
    raise exception 'Choose an active product collection' using errcode = '22023';
  end if;

  select array_agg(btrim(part)) into v_ingredients
  from regexp_split_to_table(replace(btrim(p_payload->>'ingredients'), chr(10), ','), '[,;]+') as parts(part)
  where btrim(part) <> '';
  if coalesce(cardinality(v_ingredients), 0) = 0 then
    raise exception 'At least one ingredient is required' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(part)), '{}'::text[]) into v_allergens
  from regexp_split_to_table(replace(coalesce(p_payload->>'allergen_information', ''), chr(10), ','), '[,;]+') as parts(part)
  where btrim(part) <> '';

  if p_product_id is null then
    insert into public.products (
      name, category, price, currency, description, image_url, ingredients,
      allergen_information, batch_number, stock_quantity, low_stock_threshold,
      manufacturing_date, expiry_date, storage_location, track_inventory, is_active
    ) values (
      v_name, v_category, v_price, 'LKR',
      nullif(btrim(p_payload->>'description'), ''),
      nullif(btrim(p_payload->>'image_url'), ''),
      btrim(p_payload->>'ingredients'),
      nullif(btrim(p_payload->>'allergen_information'), ''),
      nullif(btrim(p_payload->>'batch_number'), ''),
      v_stock, v_threshold, v_mfg, v_expiry,
      nullif(btrim(p_payload->>'storage_location'), ''),
      v_track_inventory, false
    ) returning id into v_product_id;
  else
    update public.products set
      name = v_name,
      category = v_category,
      price = v_price,
      currency = 'LKR',
      description = nullif(btrim(p_payload->>'description'), ''),
      image_url = nullif(btrim(p_payload->>'image_url'), ''),
      ingredients = btrim(p_payload->>'ingredients'),
      allergen_information = nullif(btrim(p_payload->>'allergen_information'), ''),
      batch_number = nullif(btrim(p_payload->>'batch_number'), ''),
      stock_quantity = v_stock,
      low_stock_threshold = v_threshold,
      manufacturing_date = v_mfg,
      expiry_date = v_expiry,
      storage_location = nullif(btrim(p_payload->>'storage_location'), ''),
      track_inventory = v_track_inventory
    where id = p_product_id
    returning id into v_product_id;

    if v_product_id is null then
      raise exception 'Product not found or not available for owner update' using errcode = 'P0002';
    end if;
  end if;

  v_slug := 'cic-' || lower(v_product_id::text);
  v_qr_url := 'https://craveislandceylonv18supabaseintegra.vercel.app/passport.html?slug=' || v_slug;

  -- Preserve any existing origin, public story and publication state on edit.
  insert into public.product_passports (
    product_id, public_slug, manufacturing_date, ingredients,
    allergen_information, batch_code, best_before, storage_instructions, updated_at
  ) values (
    v_product_id::text, v_slug, v_mfg, v_ingredients, v_allergens,
    nullif(btrim(p_payload->>'batch_number'), ''),
    v_expiry, nullif(btrim(p_payload->>'storage_location'), ''), now()
  )
  on conflict (product_id) do update set
    public_slug = excluded.public_slug,
    manufacturing_date = excluded.manufacturing_date,
    ingredients = excluded.ingredients,
    allergen_information = excluded.allergen_information,
    batch_code = excluded.batch_code,
    best_before = excluded.best_before,
    storage_instructions = excluded.storage_instructions,
    updated_at = now();

  update public.products set qr_code = v_qr_url where id = v_product_id;

  v_result := jsonb_build_object(
    'product_id', v_product_id,
    'slug', v_slug,
    'qr_url', v_qr_url,
    'created', p_product_id is null,
    'replayed', false
  );

  insert into private.owner_product_save_requests (
    owner_id, request_id, product_id, request_payload, result_payload
  ) values (v_owner_id, p_request_id, v_product_id, p_payload, v_result);

  return v_result;
end;
$function$;

revoke all on function public.owner_save_product_passport(uuid, uuid, jsonb) from public;
revoke all on function public.owner_save_product_passport(uuid, uuid, jsonb) from anon;
grant execute on function public.owner_save_product_passport(uuid, uuid, jsonb) to authenticated;


-- Atomically save/publish an existing product passport and keep its QR URL aligned.
create or replace function public.owner_update_product_passport(
  p_product_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_owner_id uuid;
  v_product_name text;
  v_is_active boolean;
  v_published boolean;
  v_mfg date;
  v_best_before date;
  v_slug text;
  v_qr_url text;
  v_ingredients text[];
  v_allergens text[];
begin
  v_owner_id := auth.uid();
  if v_owner_id is null or not private.is_approved_owner() then
    raise exception 'Approved owner access required' using errcode = '42501';
  end if;
  if p_product_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A valid product and passport payload are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner_id::text || ':passport:' || p_product_id::text, 0));

  select name, is_active into v_product_name, v_is_active
  from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if nullif(btrim(p_payload->>'ingredients'), '') is null then
    raise exception 'Verified ingredients are required' using errcode = '22023';
  end if;

  begin
    v_mfg := nullif(p_payload->>'manufacturing_date', '')::date;
    v_best_before := nullif(p_payload->>'best_before', '')::date;
    if coalesce(p_payload->>'published', 'false') not in ('true', 'false') then
      raise exception 'Published must be true or false';
    end if;
    v_published := coalesce((p_payload->>'published')::boolean, false);
  exception when others then
    raise exception 'Passport dates or publication setting are invalid' using errcode = '22023';
  end;

  if v_mfg is not null and v_best_before is not null and v_mfg > v_best_before then
    raise exception 'Manufacturing date cannot be later than best-before date' using errcode = '22023';
  end if;
  if v_published and not v_is_active then
    raise exception 'Activate the product before publishing its QR passport' using errcode = '22023';
  end if;

  select array_agg(btrim(part)) into v_ingredients
  from regexp_split_to_table(replace(btrim(p_payload->>'ingredients'), chr(10), ','), '[,;]+') as parts(part)
  where btrim(part) <> '';
  if coalesce(cardinality(v_ingredients), 0) = 0 then
    raise exception 'At least one ingredient is required' using errcode = '22023';
  end if;
  select coalesce(array_agg(btrim(part)), '{}'::text[]) into v_allergens
  from regexp_split_to_table(replace(coalesce(p_payload->>'allergen_information', ''), chr(10), ','), '[,;]+') as parts(part)
  where btrim(part) <> '';

  v_slug := 'cic-' || lower(p_product_id::text);
  v_qr_url := 'https://craveislandceylonv18supabaseintegra.vercel.app/passport.html?slug=' || v_slug;

  insert into public.product_passports (
    product_id, public_slug, manufacturing_date, ingredients, allergen_information,
    origin, batch_code, best_before, storage_instructions, public_story, published, updated_at
  ) values (
    p_product_id::text, v_slug, v_mfg, v_ingredients, v_allergens,
    nullif(btrim(p_payload->>'origin'), ''),
    nullif(btrim(p_payload->>'batch_code'), ''),
    v_best_before,
    nullif(btrim(p_payload->>'storage_instructions'), ''),
    nullif(btrim(p_payload->>'public_story'), ''),
    v_published, now()
  )
  on conflict (product_id) do update set
    public_slug = excluded.public_slug,
    manufacturing_date = excluded.manufacturing_date,
    ingredients = excluded.ingredients,
    allergen_information = excluded.allergen_information,
    origin = excluded.origin,
    batch_code = excluded.batch_code,
    best_before = excluded.best_before,
    storage_instructions = excluded.storage_instructions,
    public_story = excluded.public_story,
    published = excluded.published,
    updated_at = now();

  update public.products set qr_code = v_qr_url where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'product_name', v_product_name,
    'slug', v_slug,
    'qr_url', v_qr_url,
    'published', v_published
  );
end;
$function$;

revoke all on function public.owner_update_product_passport(uuid, jsonb) from public;
revoke all on function public.owner_update_product_passport(uuid, jsonb) from anon;
grant execute on function public.owner_update_product_passport(uuid, jsonb) to authenticated;
