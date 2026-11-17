-- Keep the exposed RPC as SECURITY INVOKER.
-- The implementation remains in the non-exposed private schema and performs
-- its own approved-owner check before changing any product image path.
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.owner_attach_product_image_impl(uuid, text) TO authenticated;

ALTER FUNCTION public.owner_attach_product_image(uuid, text) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.owner_attach_product_image(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_attach_product_image(uuid, text) TO authenticated;
