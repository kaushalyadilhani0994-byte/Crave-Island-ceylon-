-- CRAVE ISLAND CEYLON: keep product photos private and enforce upload limits at Storage level.
-- Apply only after owner approval; this migration does not make the bucket public.
update storage.buckets
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'product-images';
