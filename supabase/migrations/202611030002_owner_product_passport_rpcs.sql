-- CRAVE ISLAND CEYLON: owner-only product/passport write path.
-- Review branch only; validate in an isolated database before production.

create table if not exists private.owner_product_requests(
 actor_user_id uuid not null, request_id uuid not null, payload_hash text not null,
 product_id uuid not null, created_at timestamptz not null default now(),
 primary key(actor_user_id,request_id)
);
revoke all on private.owner_product_requests from public,anon,authenticated,service_role;

create or replace function private.owner_save_product_passport_impl(
 p_product_id uuid,p_request_id uuid,p_payload jsonb,p_site_origin text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_hash text; v_old private.owner_product_requests%rowtype;
 v_id uuid; v_slug text; v_url text; v_name text:=nullif(btrim(p_payload->>'name'),'');
 v_cat text:=nullif(btrim(p_payload->>'category'),''); v_price numeric:=(p_payload->>'price')::numeric;
 v_stock integer:=coalesce((p_payload->>'stock_quantity')::integer,0);
 v_low integer:=coalesce((p_payload->>'low_stock_threshold')::integer,5);
 v_mfg date:=nullif(p_payload->>'manufacturing_date','')::date;
 v_exp date:=nullif(p_payload->>'expiry_date','')::date;
begin
 if v_actor is null or not private.is_approved_owner() then raise exception 'approved_owner_required' using errcode='42501'; end if;
 if p_request_id is null or jsonb_typeof(p_payload)<>'object' or v_name is null or v_cat is null
   or v_price is null or v_price<=0 or v_price>2000000 or coalesce(p_payload->>'currency','LKR')<>'LKR'
   or nullif(btrim(p_payload->>'ingredients'),'') is null or v_stock<0 or v_low<0
   or (v_mfg is not null and v_exp is not null and v_mfg>v_exp)
   or (coalesce(p_payload->>'image_url','')<>'' and p_payload->>'image_url' !~* '^https://')
   or p_site_origin is null or p_site_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?
 then raise exception 'invalid_product_payload' using errcode='22023'; end if;
 if not exists(select 1 from public.categories c where c.name=v_cat and c.is_active) then
   raise exception 'active_category_required' using errcode='22023';
 end if;
 v_hash:=md5(p_payload::text||'|'||coalesce(p_product_id::text,'new'));
 select * into v_old from private.owner_product_requests where actor_user_id=v_actor and request_id=p_request_id;
 if found then
   if v_old.payload_hash<>v_hash then raise exception 'idempotency_key_reused' using errcode='22023'; end if;
   v_id:=v_old.product_id;
 else
   if p_product_id is null then
     insert into public.products(name,category,price,currency,description,image_url,ingredients,allergen_information,batch_number,stock_quantity,low_stock_threshold,manufacturing_date,expiry_date,storage_location,track_inventory,is_active,updated_at)
     values(v_name,v_cat,v_price,'LKR',nullif(p_payload->>'description',''),nullif(p_payload->>'image_url',''),p_payload->>'ingredients',nullif(p_payload->>'allergen_information',''),nullif(p_payload->>'batch_number',''),v_stock,v_low,v_mfg,v_exp,nullif(p_payload->>'storage_location',''),coalesce((p_payload->>'track_inventory')::boolean,false),false,now())
     returning id into v_id;
   else
     update public.products set name=v_name,category=v_cat,price=v_price,currency='LKR',
       description=nullif(p_payload->>'description',''),image_url=nullif(p_payload->>'image_url',''),
       ingredients=p_payload->>'ingredients',allergen_information=nullif(p_payload->>'allergen_information',''),
       batch_number=nullif(p_payload->>'batch_number',''),stock_quantity=v_stock,low_stock_threshold=v_low,
       manufacturing_date=v_mfg,expiry_date=v_exp,storage_location=nullif(p_payload->>'storage_location',''),
       track_inventory=coalesce((p_payload->>'track_inventory')::boolean,false),updated_at=now()
     where id=p_product_id returning id into v_id;
     if v_id is null then raise exception 'product_not_found' using errcode='P0002'; end if;
   end if;
   insert into private.owner_product_requests values(v_actor,p_request_id,v_hash,v_id,now());
 end if;
 v_slug:='cic-'||lower(v_id::text); v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,batch_code,best_before,storage_instructions,published,updated_at)
 values(v_id::text,v_slug,v_mfg,array(select btrim(x) from regexp_split_to_table(p_payload->>'ingredients','[,;\n]+') x where btrim(x)<>''),array(select btrim(x) from regexp_split_to_table(coalesce(p_payload->>'allergen_information',''),'[,;\n]+') x where btrim(x)<>''),nullif(p_payload->>'batch_number',''),v_exp,nullif(p_payload->>'storage_location',''),false,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,updated_at=now();
 update public.products set qr_code=v_url where id=v_id;
 return jsonb_build_object('id',v_id,'product_id',v_id,'qr_url',v_url,'public_slug',v_slug,'created',p_product_id is null,'replayed',v_old.product_id is not null);
end $$;

revoke all on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) from public,anon;
grant execute on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) to authenticated;
create or replace function public.owner_save_product_passport(p_product_id uuid,p_request_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_save_product_passport_impl(p_product_id,p_request_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_save_product_passport(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.owner_save_product_passport(uuid,uuid,jsonb,text) to authenticated;

create or replace function private.owner_update_product_passport_impl(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_slug text:='cic-'||lower(p_product_id::text); v_url text;
 v_mfg date:=nullif(p_payload->>'manufacturing_date','')::date;
 v_best date:=nullif(p_payload->>'best_before','')::date;
 v_pub boolean:=coalesce((p_payload->>'published')::boolean,false);
begin
 if auth.uid() is null or not private.is_approved_owner() then raise exception 'approved_owner_required' using errcode='42501'; end if;
 if p_product_id is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'ingredients')<>'array' or jsonb_typeof(p_payload->'allergen_information')<>'array' or p_site_origin is null or p_site_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)? raise exception 'invalid_passport_payload' using errcode='22023'; end if;
 if v_mfg is not null and v_best is not null and v_mfg>v_best then raise exception 'invalid_passport_dates' using errcode='22023'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id for update) then raise exception 'product_not_found' using errcode='P0002'; end if;
 if v_pub and not exists(select 1 from public.products p where p.id=p_product_id and p.is_active) then raise exception 'hidden_product_cannot_publish' using errcode='22023'; end if;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,origin,batch_code,best_before,storage_instructions,public_story,published,updated_at)
 values(p_product_id::text,v_slug,v_mfg,array(select jsonb_array_elements_text(p_payload->'ingredients')),array(select jsonb_array_elements_text(p_payload->'allergen_information')),nullif(p_payload->>'origin',''),nullif(p_payload->>'batch_code',''),v_best,nullif(p_payload->>'storage_instructions',''),nullif(p_payload->>'public_story',''),v_pub,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,origin=excluded.origin,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,public_story=excluded.public_story,published=excluded.published,updated_at=now();
 v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 update public.products set qr_code=v_url,updated_at=now() where id=p_product_id;
 return jsonb_build_object('product_id',p_product_id,'qr_url',v_url,'public_slug',v_slug,'published',v_pub);
end $$;
revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public,anon;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;
create or replace function public.owner_update_product_passport(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_update_product_passport_impl(p_product_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_update_product_passport(uuid,jsonb,text) from public,anon;
grant execute on function public.owner_update_product_passport(uuid,jsonb,text) to authenticated;

 then raise exception 'invalid_product_payload' using errcode='22023'; end if;
 if not exists(select 1 from public.categories c where c.name=v_cat and c.is_active) then
   raise exception 'active_category_required' using errcode='22023';
 end if;
 v_hash:=md5(p_payload::text||'|'||coalesce(p_product_id::text,'new'));
 select * into v_old from private.owner_product_requests where actor_user_id=v_actor and request_id=p_request_id;
 if found then
   if v_old.payload_hash<>v_hash then raise exception 'idempotency_key_reused' using errcode='22023'; end if;
   v_id:=v_old.product_id;
 else
   if p_product_id is null then
     insert into public.products(name,category,price,currency,description,image_url,ingredients,allergen_information,batch_number,stock_quantity,low_stock_threshold,manufacturing_date,expiry_date,storage_location,track_inventory,is_active,updated_at)
     values(v_name,v_cat,v_price,'LKR',nullif(p_payload->>'description',''),nullif(p_payload->>'image_url',''),p_payload->>'ingredients',nullif(p_payload->>'allergen_information',''),nullif(p_payload->>'batch_number',''),v_stock,v_low,v_mfg,v_exp,nullif(p_payload->>'storage_location',''),coalesce((p_payload->>'track_inventory')::boolean,false),false,now())
     returning id into v_id;
   else
     update public.products set name=v_name,category=v_cat,price=v_price,currency='LKR',
       description=nullif(p_payload->>'description',''),image_url=nullif(p_payload->>'image_url',''),
       ingredients=p_payload->>'ingredients',allergen_information=nullif(p_payload->>'allergen_information',''),
       batch_number=nullif(p_payload->>'batch_number',''),stock_quantity=v_stock,low_stock_threshold=v_low,
       manufacturing_date=v_mfg,expiry_date=v_exp,storage_location=nullif(p_payload->>'storage_location',''),
       track_inventory=coalesce((p_payload->>'track_inventory')::boolean,false),updated_at=now()
     where id=p_product_id returning id into v_id;
     if v_id is null then raise exception 'product_not_found' using errcode='P0002'; end if;
   end if;
   insert into private.owner_product_requests values(v_actor,p_request_id,v_hash,v_id,now());
 end if;
 v_slug:='cic-'||lower(v_id::text); v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,batch_code,best_before,storage_instructions,published,updated_at)
 values(v_id::text,v_slug,v_mfg,array(select btrim(x) from regexp_split_to_table(p_payload->>'ingredients','[,;\n]+') x where btrim(x)<>''),array(select btrim(x) from regexp_split_to_table(coalesce(p_payload->>'allergen_information',''),'[,;\n]+') x where btrim(x)<>''),nullif(p_payload->>'batch_number',''),v_exp,nullif(p_payload->>'storage_location',''),false,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,updated_at=now();
 update public.products set qr_code=v_url where id=v_id;
 return jsonb_build_object('id',v_id,'product_id',v_id,'qr_url',v_url,'public_slug',v_slug,'created',p_product_id is null,'replayed',v_old.product_id is not null);
end $$;

revoke all on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) from public,anon;
grant execute on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) to authenticated;
create or replace function public.owner_save_product_passport(p_product_id uuid,p_request_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_save_product_passport_impl(p_product_id,p_request_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_save_product_passport(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.owner_save_product_passport(uuid,uuid,jsonb,text) to authenticated;

create or replace function private.owner_update_product_passport_impl(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_slug text:='cic-'||lower(p_product_id::text); v_url text;
 v_mfg date:=nullif(p_payload->>'manufacturing_date','')::date;
 v_best date:=nullif(p_payload->>'best_before','')::date;
 v_pub boolean:=coalesce((p_payload->>'published')::boolean,false);
begin
 if auth.uid() is null or not private.is_approved_owner() then raise exception 'approved_owner_required' using errcode='42501'; end if;
 if p_product_id is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'ingredients')<>'array' or jsonb_typeof(p_payload->'allergen_information')<>'array' or p_site_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then raise exception 'invalid_passport_payload' using errcode='22023'; end if;
 if v_mfg is not null and v_best is not null and v_mfg>v_best then raise exception 'invalid_passport_dates' using errcode='22023'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id for update) then raise exception 'product_not_found' using errcode='P0002'; end if;
 if v_pub and not exists(select 1 from public.products p where p.id=p_product_id and p.is_active) then raise exception 'hidden_product_cannot_publish' using errcode='22023'; end if;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,origin,batch_code,best_before,storage_instructions,public_story,published,updated_at)
 values(p_product_id::text,v_slug,v_mfg,array(select jsonb_array_elements_text(p_payload->'ingredients')),array(select jsonb_array_elements_text(p_payload->'allergen_information')),nullif(p_payload->>'origin',''),nullif(p_payload->>'batch_code',''),v_best,nullif(p_payload->>'storage_instructions',''),nullif(p_payload->>'public_story',''),v_pub,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,origin=excluded.origin,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,public_story=excluded.public_story,published=excluded.published,updated_at=now();
 v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 update public.products set qr_code=v_url,updated_at=now() where id=p_product_id;
 return jsonb_build_object('product_id',p_product_id,'qr_url',v_url,'public_slug',v_slug,'published',v_pub);
end $$;
revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public,anon;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;
create or replace function public.owner_update_product_passport(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_update_product_passport_impl(p_product_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_update_product_passport(uuid,jsonb,text) from public,anon;
grant execute on function public.owner_update_product_passport(uuid,jsonb,text) to authenticated;
 then raise exception 'invalid_passport_payload' using errcode='22023'; end if;
 if v_mfg is not null and v_best is not null and v_mfg>v_best then raise exception 'invalid_passport_dates' using errcode='22023'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id for update) then raise exception 'product_not_found' using errcode='P0002'; end if;
 if v_pub and not exists(select 1 from public.products p where p.id=p_product_id and p.is_active) then raise exception 'hidden_product_cannot_publish' using errcode='22023'; end if;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,origin,batch_code,best_before,storage_instructions,public_story,published,updated_at)
 values(p_product_id::text,v_slug,v_mfg,array(select jsonb_array_elements_text(p_payload->'ingredients')),array(select jsonb_array_elements_text(p_payload->'allergen_information')),nullif(p_payload->>'origin',''),nullif(p_payload->>'batch_code',''),v_best,nullif(p_payload->>'storage_instructions',''),nullif(p_payload->>'public_story',''),v_pub,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,origin=excluded.origin,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,public_story=excluded.public_story,published=excluded.published,updated_at=now();
 v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 update public.products set qr_code=v_url,updated_at=now() where id=p_product_id;
 return jsonb_build_object('product_id',p_product_id,'qr_url',v_url,'public_slug',v_slug,'published',v_pub);
end $$;
revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public,anon;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;
create or replace function public.owner_update_product_passport(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_update_product_passport_impl(p_product_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_update_product_passport(uuid,jsonb,text) from public,anon;
grant execute on function public.owner_update_product_passport(uuid,jsonb,text) to authenticated;

 then raise exception 'invalid_product_payload' using errcode='22023'; end if;
 if not exists(select 1 from public.categories c where c.name=v_cat and c.is_active) then
   raise exception 'active_category_required' using errcode='22023';
 end if;
 v_hash:=md5(p_payload::text||'|'||coalesce(p_product_id::text,'new'));
 select * into v_old from private.owner_product_requests where actor_user_id=v_actor and request_id=p_request_id;
 if found then
   if v_old.payload_hash<>v_hash then raise exception 'idempotency_key_reused' using errcode='22023'; end if;
   v_id:=v_old.product_id;
 else
   if p_product_id is null then
     insert into public.products(name,category,price,currency,description,image_url,ingredients,allergen_information,batch_number,stock_quantity,low_stock_threshold,manufacturing_date,expiry_date,storage_location,track_inventory,is_active,updated_at)
     values(v_name,v_cat,v_price,'LKR',nullif(p_payload->>'description',''),nullif(p_payload->>'image_url',''),p_payload->>'ingredients',nullif(p_payload->>'allergen_information',''),nullif(p_payload->>'batch_number',''),v_stock,v_low,v_mfg,v_exp,nullif(p_payload->>'storage_location',''),coalesce((p_payload->>'track_inventory')::boolean,false),false,now())
     returning id into v_id;
   else
     update public.products set name=v_name,category=v_cat,price=v_price,currency='LKR',
       description=nullif(p_payload->>'description',''),image_url=nullif(p_payload->>'image_url',''),
       ingredients=p_payload->>'ingredients',allergen_information=nullif(p_payload->>'allergen_information',''),
       batch_number=nullif(p_payload->>'batch_number',''),stock_quantity=v_stock,low_stock_threshold=v_low,
       manufacturing_date=v_mfg,expiry_date=v_exp,storage_location=nullif(p_payload->>'storage_location',''),
       track_inventory=coalesce((p_payload->>'track_inventory')::boolean,false),updated_at=now()
     where id=p_product_id returning id into v_id;
     if v_id is null then raise exception 'product_not_found' using errcode='P0002'; end if;
   end if;
   insert into private.owner_product_requests values(v_actor,p_request_id,v_hash,v_id,now());
 end if;
 v_slug:='cic-'||lower(v_id::text); v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,batch_code,best_before,storage_instructions,published,updated_at)
 values(v_id::text,v_slug,v_mfg,array(select btrim(x) from regexp_split_to_table(p_payload->>'ingredients','[,;\n]+') x where btrim(x)<>''),array(select btrim(x) from regexp_split_to_table(coalesce(p_payload->>'allergen_information',''),'[,;\n]+') x where btrim(x)<>''),nullif(p_payload->>'batch_number',''),v_exp,nullif(p_payload->>'storage_location',''),false,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,updated_at=now();
 update public.products set qr_code=v_url where id=v_id;
 return jsonb_build_object('id',v_id,'product_id',v_id,'qr_url',v_url,'public_slug',v_slug,'created',p_product_id is null,'replayed',v_old.product_id is not null);
end $$;

revoke all on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) from public,anon;
grant execute on function private.owner_save_product_passport_impl(uuid,uuid,jsonb,text) to authenticated;
create or replace function public.owner_save_product_passport(p_product_id uuid,p_request_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_save_product_passport_impl(p_product_id,p_request_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_save_product_passport(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.owner_save_product_passport(uuid,uuid,jsonb,text) to authenticated;

create or replace function private.owner_update_product_passport_impl(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_slug text:='cic-'||lower(p_product_id::text); v_url text;
 v_mfg date:=nullif(p_payload->>'manufacturing_date','')::date;
 v_best date:=nullif(p_payload->>'best_before','')::date;
 v_pub boolean:=coalesce((p_payload->>'published')::boolean,false);
begin
 if auth.uid() is null or not private.is_approved_owner() then raise exception 'approved_owner_required' using errcode='42501'; end if;
 if p_product_id is null or jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'ingredients')<>'array' or jsonb_typeof(p_payload->'allergen_information')<>'array' or p_site_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' then raise exception 'invalid_passport_payload' using errcode='22023'; end if;
 if v_mfg is not null and v_best is not null and v_mfg>v_best then raise exception 'invalid_passport_dates' using errcode='22023'; end if;
 if not exists(select 1 from public.products p where p.id=p_product_id for update) then raise exception 'product_not_found' using errcode='P0002'; end if;
 if v_pub and not exists(select 1 from public.products p where p.id=p_product_id and p.is_active) then raise exception 'hidden_product_cannot_publish' using errcode='22023'; end if;
 insert into public.product_passports(product_id,public_slug,manufacturing_date,ingredients,allergen_information,origin,batch_code,best_before,storage_instructions,public_story,published,updated_at)
 values(p_product_id::text,v_slug,v_mfg,array(select jsonb_array_elements_text(p_payload->'ingredients')),array(select jsonb_array_elements_text(p_payload->'allergen_information')),nullif(p_payload->>'origin',''),nullif(p_payload->>'batch_code',''),v_best,nullif(p_payload->>'storage_instructions',''),nullif(p_payload->>'public_story',''),v_pub,now())
 on conflict(product_id) do update set public_slug=excluded.public_slug,manufacturing_date=excluded.manufacturing_date,ingredients=excluded.ingredients,allergen_information=excluded.allergen_information,origin=excluded.origin,batch_code=excluded.batch_code,best_before=excluded.best_before,storage_instructions=excluded.storage_instructions,public_story=excluded.public_story,published=excluded.published,updated_at=now();
 v_url:=p_site_origin||'/passport.html?slug='||v_slug;
 update public.products set qr_code=v_url,updated_at=now() where id=p_product_id;
 return jsonb_build_object('product_id',p_product_id,'qr_url',v_url,'public_slug',v_slug,'published',v_pub);
end $$;
revoke all on function private.owner_update_product_passport_impl(uuid,jsonb,text) from public,anon;
grant execute on function private.owner_update_product_passport_impl(uuid,jsonb,text) to authenticated;
create or replace function public.owner_update_product_passport(p_product_id uuid,p_payload jsonb,p_site_origin text)
returns jsonb language sql security invoker set search_path='' as $$ select private.owner_update_product_passport_impl(p_product_id,p_payload,p_site_origin) $$;
revoke all on function public.owner_update_product_passport(uuid,jsonb,text) from public,anon;
grant execute on function public.owner_update_product_passport(uuid,jsonb,text) to authenticated;
