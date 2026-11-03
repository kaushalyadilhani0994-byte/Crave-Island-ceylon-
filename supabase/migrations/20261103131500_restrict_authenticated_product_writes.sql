-- CRAVE ISLAND CEYLON
-- All product mutations must pass through validated owner RPCs or trusted
-- service-role Edge Functions. Direct authenticated table writes could bypass
-- the QR-passport-before-activation workflow and inventory validation.
revoke insert, update, delete on table public.products from authenticated;

-- Keep customer/team product reads and owner RPC execution available.
grant select on table public.products to authenticated;
