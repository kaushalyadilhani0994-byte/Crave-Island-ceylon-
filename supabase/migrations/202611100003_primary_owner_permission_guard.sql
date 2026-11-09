-- Ensure only the primary owner email receives the implicit all-module staff permission.
-- Other approved team accounts continue to use their explicit module/action permissions.
create or replace function private.has_staff_permission(_module text, _action text)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.approved is true
      and (
        (
          sp.role = 'owner'
          and lower(coalesce(auth.jwt()->>'email', '')) = 'kaushalyadilhani0994@gmail.com'
        )
        or coalesce(sp.permissions, '{}'::jsonb) -> _module ? _action
      )
  );
$function$;

revoke all on function private.has_staff_permission(text, text) from public, anon;
grant execute on function private.has_staff_permission(text, text) to authenticated;
