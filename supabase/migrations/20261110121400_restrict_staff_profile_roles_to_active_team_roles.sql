-- Keep database staff roles aligned with the supported team roles.
-- The primary owner remains the only owner; team invites may use these four roles.
alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role = any (array['owner'::text, 'supervisor'::text, 'staff'::text, 'media'::text, 'accounts'::text]));
