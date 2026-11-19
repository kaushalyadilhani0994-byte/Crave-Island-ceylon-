-- Securely attach a private product photo after the approved owner uploads it.
-- The browser role intentionally has no direct UPDATE grant on products.image_url.
CREATE OR REPLACE FUNCTION private.owner_attach_product_image_impl(
  p_product_id uuid,
  p_object_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_product_id uuid;
BEGIN
  IF auth.uid() IS NULL OR private.is_approved_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Approved owner access required' USING errcode = '42501';
  END IF;

  IF p_product_id IS NULL OR p_object_path IS NULL
     OR p_object_path !~ ('^' || p_product_id::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'Invalid product image path' USING errcode = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects o
     WHERE o.bucket_id = 'product-images'
       AND o.name = p_object_path
  ) THEN
    RAISE EXCEPTION 'Uploaded product image was not found' USING errcode = 'P0002';
  END IF;

  UPDATE public.products
     SET image_url = p_object_path,
         updated_at = now()
   WHERE id = p_product_id
   RETURNING id INTO v_product_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING errcode = 'P0002';
  END IF;

  RETURN jsonb_build_object('product_id', v_product_id, 'image_url', p_object_path);
END;
$function$;

REVOKE ALL ON FUNCTION private.owner_attach_product_image_impl(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_attach_product_image(
  p_product_id uuid,
  p_object_path text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.owner_attach_product_image_impl(p_product_id, p_object_path);
$function$;

REVOKE ALL ON FUNCTION public.owner_attach_product_image(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_attach_product_image(uuid, text) TO authenticated;
