-- Trigger functions are invoked by PostgreSQL through their installed triggers.
-- They are not API RPC endpoints; remove inherited PUBLIC/anon/authenticated
-- EXECUTE privileges so the trigger helper cannot be called directly.
REVOKE EXECUTE ON FUNCTION public.prevent_store_order_item_delete()
FROM PUBLIC, anon, authenticated;
