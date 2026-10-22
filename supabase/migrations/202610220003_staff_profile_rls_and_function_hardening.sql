-- Allow each authenticated staff user to read only their own authorization profile.
drop policy if exists "Staff read own profile" on public.staff_profiles;
create policy "Staff read own profile"
  on public.staff_profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- This DDL event-trigger function is not intended to be callable through the Data API.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
revoke all on function public.rls_auto_enable() from authenticated;
