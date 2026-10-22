-- CRAVE ISLAND CEYLON — let staff read only their own authorization row.
-- This is required for owner-only product/category RLS policies to evaluate
-- the caller's staff_profiles row without exposing other staff records.
alter table public.staff_profiles enable row level security;
drop policy if exists "Staff read own profile" on public.staff_profiles;
create policy "Staff read own profile"
  on public.staff_profiles
  for select
  to authenticated
  using (id = (select auth.uid()));
