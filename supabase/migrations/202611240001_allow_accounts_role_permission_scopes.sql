-- The Accounts team-role preset includes invoices and payments scopes.
-- Permit these known module names in the owner-only permission editor validator.
-- Authorization remains enforced by private.has_staff_permission and table RLS.
create or replace function private.owner_set_team_member_access_impl(
  _user_id uuid,
  _role text,
  _approved boolean,
  _permissions jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_target public.staff_profiles%rowtype;
  v_permissions jsonb := coalesce(_permissions, '{}'::jsonb);
  v_module text;
  v_actions jsonb;
  v_action text;
  v_allowed_modules text[] := array[
    'catalogue','inventory','orders','dispatch','media','accounts',
    'invoices','payments','loyalty','scratch_cards','star_club',
    'certificates','reports','tasks','settings'
  ];
  v_allowed_actions text[] := array['read','create','update','delete','approve','export'];
begin
  if v_actor is null or not private.is_approved_owner() then
    raise exception 'owner_access_required' using errcode = '42501';
  end if;

  if _user_id is null
     or _role is null
     or _role not in ('supervisor','staff','media','accounts')
     or _approved is null
     or jsonb_typeof(v_permissions) <> 'object' then
    raise exception 'invalid_team_member_or_permissions' using errcode = '22023';
  end if;

  for v_module, v_actions in
    select key, value from jsonb_each(v_permissions)
  loop
    if not (v_module = any(v_allowed_modules)) or jsonb_typeof(v_actions) <> 'array' then
      raise exception 'invalid_permission_module' using errcode = '22023';
    end if;

    for v_action in select jsonb_array_elements_text(v_actions)
    loop
      if not (v_action = any(v_allowed_actions)) then
        raise exception 'invalid_permission_action' using errcode = '22023';
      end if;
    end loop;

    if exists (
      select 1 from jsonb_array_elements(v_actions) as a(value)
      where jsonb_typeof(a.value) <> 'string'
    ) then
      raise exception 'permission_actions_must_be_strings' using errcode = '22023';
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(v_actions) as a(action)
      where a.action <> 'read'
    ) and not (v_actions ? 'read') then
      raise exception 'read_permission_required_for_other_actions' using errcode = '22023';
    end if;
  end loop;

  select * into v_target
  from public.staff_profiles
  where id = _user_id
  for update;

  if not found or v_target.role = 'owner' then
    raise exception 'team_member_not_found_or_owner' using errcode = 'P0002';
  end if;

  update public.staff_profiles
     set role = _role,
         approved = _approved,
         permissions = v_permissions
   where id = _user_id;

  insert into private.staff_access_audit (
    actor_user_id, target_user_id,
    old_role, new_role, old_approved, new_approved,
    old_permissions, new_permissions
  ) values (
    v_actor, _user_id,
    v_target.role, _role, v_target.approved, _approved,
    coalesce(v_target.permissions, '{}'::jsonb), v_permissions
  );
end;
$function$;
