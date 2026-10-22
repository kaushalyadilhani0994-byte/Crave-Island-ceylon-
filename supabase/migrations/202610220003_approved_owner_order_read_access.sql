drop policy if exists "Approved owners read all store orders" on public.store_orders;
create policy "Approved owners read all store orders" on public.store_orders for select to authenticated using ((select private.is_approved_owner()));
drop policy if exists "Approved owners read all order items" on public.store_order_items;
create policy "Approved owners read all order items" on public.store_order_items for select to authenticated using ((select private.is_approved_owner()));