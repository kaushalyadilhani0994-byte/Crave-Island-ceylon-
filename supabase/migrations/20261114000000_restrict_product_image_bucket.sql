-- CRAVE ISLAND CEYLON: keep product photos private and enforce upload limits at Storage level.
-- Apply only after owner approval; this migration does not make the bucket public.
update storage.buckets
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'product-images';

-- Permit the approved owner to remove orphaned/replaced product photos.
-- This does not grant public or staff delete access.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Owner delete product images'
  ) then
    create policy "Owner delete product images"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'product-images'
        and exists (
          select 1 from public.staff_profiles sp
          where sp.id = auth.uid()
            and sp.role = 'owner'
            and sp.approved = true
        )
      );
  end if;
end
$$;
