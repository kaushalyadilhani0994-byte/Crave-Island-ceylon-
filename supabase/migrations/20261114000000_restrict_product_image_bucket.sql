-- CRAVE ISLAND CEYLON: keep product photos private and enforce upload limits.
-- Apply only after owner approval; this migration does not make product photos public.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'product-images';

-- Remove the legacy broad "owner" policies. PostgreSQL permissive policies are
-- OR-combined, so adding a stricter policy without removing these would not
-- actually restrict uploads/reads to the primary owner.
DROP POLICY IF EXISTS "Owner read brand images" ON storage.objects;
DROP POLICY IF EXISTS "Owner upload brand images" ON storage.objects;
DROP POLICY IF EXISTS "Owner read product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner insert product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner read category images" ON storage.objects;
DROP POLICY IF EXISTS "Owner insert category images" ON storage.objects;

-- Product image reads are private. The public storefront obtains short-lived
-- signed URLs only through the product-image Edge Function.
CREATE POLICY "Owner read product images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND private.is_approved_owner());

CREATE POLICY "Owner insert product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND private.is_approved_owner()
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

CREATE POLICY "Owner delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND private.is_approved_owner());

-- Keep category-image operations available to the primary owner only as well.
CREATE POLICY "Owner read category images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'category-images' AND private.is_approved_owner());

CREATE POLICY "Owner insert category images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'category-images' AND private.is_approved_owner());
