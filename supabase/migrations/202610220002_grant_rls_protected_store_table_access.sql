-- Grant only the table privileges needed by the storefront.
-- RLS policies remain the authority for which rows can be read or changed.
grant usage on schema public to anon, authenticated;

grant select on table public.products, public.categories to anon, authenticated;
grant insert, update, delete on table public.products, public.categories to authenticated;

grant select on table public.product_passports to anon, authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;
grant select on table public.staff_profiles to authenticated;
grant select on table public.store_orders, public.store_order_items to authenticated;

-- Owner policies call this helper. Keep it in the non-exposed private schema.
grant usage on schema private to authenticated;
grant execute on function private.is_approved_owner() to authenticated;
