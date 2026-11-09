-- Restrict Main Admin authority to the primary approved owner email.
-- Existing owner profile remains unchanged; no user/product/order rows are modified.
create or replace function private.is_approved_owner()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select lower(coalesce(auth.jwt()->>'email', '')) = 'kaushalyadilhani0994@gmail.com'
    and exists (
      select 1
      from public.staff_profiles sp
      where sp.id = (select auth.uid())
        and sp.role = 'owner'
        and sp.approved is true
    );
$function$;

revoke all on function private.is_approved_owner() from public, anon;
grant execute on function private.is_approved_owner() to authenticated;
