-- CRAVE ISLAND CEYLON
-- Keep the public passport and the operational product row in sync.
-- This prevents the shop catalogue, stock/expiry automation, checkout and QR
-- passport from showing conflicting ingredients, allergens, batch or dates.

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
  v_batch text;
  v_origin_value text;
  v_storage text;
  v_story text;
  v_published boolean;
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

  select * into v_product
    from public.products
   where id=p_product_id
   for update;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

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

  if cardinality(v_ingredients)=0
     or array_length(v_ingredients,1)>100
     or exists(select 1 from unnest(v_ingredients) x where length(x)>300)
     or array_length(v_allergens,1)>100
     or exists(select 1 from unnest(v_allergens) x where length(x)>300) then
    raise exception 'invalid_passport_ingredient_or_allergen_list' using errcode = '22023';
  end if;

  v_mfg := nullif(p_payload->>'manufacturing_date','')::date;
  v_best := nullif(p_payload->>'best_before','')::date;
  v_batch := nullif(btrim(p_payload->>'batch_code'),'');
  v_origin_value := nullif(btrim(p_payload->>'origin'),'');
  v_storage := nullif(btrim(p_payload->>'storage_instructions'),'');
  v_story := nullif(btrim(p_payload->>'public_story'),'');
  v_published := coalesce((p_payload->>'published')::boolean,false);

  if length(coalesce(v_batch,''))>100
     or length(coalesce(v_origin_value,''))>180
     or length(coalesce(v_storage,''))>500
     or length(coalesce(v_story,''))>2000 then
    raise exception 'passport_text_field_too_long' using errcode = '22023';
  end if;
  if v_mfg is not null and v_mfg > (now() at time zone 'Asia/Colombo')::date then
    raise exception 'manufacturing_date_cannot_be_in_future' using errcode = '22023';
  end if;
  if v_mfg is not null and v_best is not null and v_mfg > v_best then
    raise exception 'invalid_product_date_range' using errcode = '22023';
  end if;
  if v_published and v_product.is_active is not true then
    raise exception 'activate_product_before_publishing_passport' using errcode = '22023';
  end if;
  if v_published and v_best is not null
     and v_best < (now() at time zone 'Asia/Colombo')::date then
    raise exception 'expired_passport_cannot_be_published' using errcode = '22023';
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
      origin=v_origin_value,
      batch_code=v_batch,
      manufacturing_date=v_mfg,
      best_before=v_best,
      storage_instructions=v_storage,
      public_story=v_story,
      published=v_published,
      updated_at=now()
    where product_id=p_product_id::text;
  else
    v_slug := replace(gen_random_uuid()::text, '-', '');
    insert into public.product_passports (
      product_id, public_slug, ingredients, allergen_information, origin,
      batch_code, manufacturing_date, best_before, storage_instructions,
      public_story, published, updated_at
    ) values (
      p_product_id::text, v_slug, v_ingredients, v_allergens, v_origin_value,
      v_batch, v_mfg, v_best, v_storage, v_story, v_published, now()
    );
  end if;

  v_qr_url := v_origin || '/passport.html?slug=' || v_slug;

  -- Mirror the label facts into the product row so catalogue, checkout and
  -- expiry/stock automation all use the same verified values as the passport.
  update public.products set
    ingredients=array_to_string(v_ingredients, ', '),
    allergen_information=nullif(array_to_string(v_allergens, ', '),''),
    batch_number=v_batch,
    manufacturing_date=v_mfg,
    expiry_date=v_best,
    qr_code=v_qr_url,
    updated_at=now()
  where id=p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'qr_url', v_qr_url,
    'published', v_published
  );
end;
$function$;

revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;
