-- CRAVE ISLAND CEYLON: secure staff access foundation.
-- Apply after 202610220002_harden_owner_catalogue_policies.sql.
-- Existing owner login and storefront are preserved; this adds a separate staff
-- assignment layer instead of changing the existing staff_profiles role constraint.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.staff_access_assignments (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('supervisor','staff','media','accounts')),
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint staff_access_permissions_object check (jsonb_typeof(permissions) = 'object')
);

alter table public.staff_access_assignments enable row level security;
revoke all on public.staff_access_assignments from anon, authenticated;
grant select on public.staff_access_assignments to authenticated;

drop policy if exists "Staff read own active assignment" on public.staff_access_assignments;
create policy "Staff read own active assignment"
  on public.staff_access_assignments for select to authenticated
  using (user_id = (select auth.uid()) and is_active = true);

drop policy if exists "Approved owner read all staff assignments" on public.staff_access_assignments;
create policy "Approved owner read all staff assignments"
  on public.staff_access_assignments for select to authenticated
  using ((select private.is_approved_owner()));

create or replace function public.owner_set_staff_access(
  p_user_id uuid,
  p_role text,
  p_permissions jsonb default '{}'::jsonb,
  p_is_active boolean default true
) returns public.staff_access_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare result_row public.staff_access_assignments;
begin
  if not coalesce(private.is_approved_owner(), false) then
    raise exception 'Approved Main Admin access required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'A valid authenticated staff user is required';
  end if;
  if p_role not in ('supervisor','staff','media','accounts') then
    raise exception 'Role must be supervisor, staff, media, or accounts';
  end if;
  if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Permissions must be a JSON object';
  end if;
  insert into public.staff_access_assignments(user_id, role, permissions, is_active, created_by, updated_at)
  values (p_user_id, p_role, p_permissions, coalesce(p_is_active, true), auth.uid(), now())
  on conflict (user_id) do update
    set role = excluded.role,
        permissions = excluded.permissions,
        is_active = excluded.is_active,
        updated_at = now()
  returning * into result_row;
  return result_row;
end;
$$;

create or replace function public.owner_deactivate_staff_access(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not coalesce(private.is_approved_owner(), false) then
    raise exception 'Approved Main Admin access required' using errcode = '42501';
  end if;
  update public.staff_access_assignments
     set is_active = false, updated_at = now()
   where user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.owner_set_staff_access(uuid,text,jsonb,boolean) from public, anon;
revoke all on function public.owner_deactivate_staff_access(uuid) from public, anon;
grant execute on function public.owner_set_staff_access(uuid,text,jsonb,boolean) to authenticated;
grant execute on function public.owner_deactivate_staff_access(uuid) to authenticated;

comment on table public.staff_access_assignments is
  'Role assignments for Supervisor, Staff, Media, and Accounts. Main Admin is derived from the existing approved staff_profiles owner record and cannot be granted by this table.';
comment on function public.owner_set_staff_access(uuid,text,jsonb,boolean) is
  'Only an approved existing Main Admin can assign a role to an existing Supabase Auth user. This does not create Auth accounts.';
