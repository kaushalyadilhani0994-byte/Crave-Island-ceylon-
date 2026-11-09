-- Order status changes must go through the authenticated Edge Function and atomic RPC.
-- Direct authenticated table updates could bypass transition validation and cancellation restock.
drop policy if exists "Team permitted update orders" on public.store_orders;
revoke update on table public.store_orders from anon, authenticated;
