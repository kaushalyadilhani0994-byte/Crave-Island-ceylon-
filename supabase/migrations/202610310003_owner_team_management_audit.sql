-- CRAVE ISLAND CEYLON — owner-only team lifecycle and auditable permission changes.
-- REVIEW BRANCH ONLY. Do not apply to production until isolated testing and approval.

create table if not exists public.admin_team_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('approve','suspend','set_permissions')),
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_team_audit enable row level security;
revoke all on public.admin_team_audit from anon, authenticated;
grant select on public.admin_team_audit to authenticated;
drop policy if exists "Approved owner reads team audit" on public.admin_team_audit;
create policy "Approved owner reads team audit"
  on public.admin_team_audit for select to authenticated
  using (private.is_approved_owner());

create or replace function public.owner_manage_team_member(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_action text,
  p_permissions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_target public.staff_profiles%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_permissions jsonb;
  v_allowed_modules text[] := array['orders','inventory','catalogue','media','accounts','alerts','loyalty'];
  v_allowed_actions text[] := array['read','create','update','delete','approve','acknowledge','publish','export'];
  v_module text;
  v_action_name text;
begin
  if p_actor_id is null or p_target_user_id is null or p_actor_id = p_target_user_id then
    raise exception 'invalid_team_member_target' using errcode = '22023';
  end if;

  select * into v_actor from public.staff_profiles where id = p_actor_id;
  if not found or v_actor.role <> 'owner' or v_actor.approved is not true then
    raise exception 'approved_owner_required' using errcode = '42501';
  end if;

  select * into v_target from public.staff_profiles where id = p_target_user_id for update;
  if not found then
    raise exception 'team_member_not_found' using errcode = 'P0002';
  end if;
  if v_target.role = 'owner' then
    raise exception 'owner_account_is_protected' using errcode = '42501';
  end if;
  if v_target.role not in ('supervisor','staff','media','accounts','star_club') then
    raise exception 'unsupported_team_role' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'role',v_target.role,'approved',v_target.approved,
    'permissions',coalesce(v_target.permissions,'{}'::jsonb)
  );

  if p_action = 'approve' then
    update public.staff_profiles set approved = true where id = p_target_user_id;
  elsif p_action = 'suspend' then
    update public.staff_profiles set approved = false where id = p_target_user_id;
  elsif p_action = 'set_permissions' then
    if p_permissions is null or jsonb_typeof(p_permissions) <> 'object' then
      raise exception 'permissions_object_required' using errcode = '22023';
    end if;
    for v_module in select jsonb_object_keys(p_permissions) loop
      if not (v_module = any(v_allowed_modules)) then
        raise exception 'unsupported_permission_module:%',v_module using errcode = '22023';
      end if;
      if jsonb_typeof(p_permissions -> v_module) <> 'array' then
        raise exception 'permission_actions_must_be_arrays' using errcode = '22023';
      end if;
      for v_action_name in
        select jsonb_array_elements_text(p_permissions -> v_module)
      loop
        if not (v_action_name = any(v_allowed_actions)) then
          raise exception 'unsupported_permission_action:%',v_action_name using errcode = '22023';
        end if;
      end loop;
    end loop;
    update public.staff_profiles set permissions = p_permissions where id = p_target_user_id;
  else
    raise exception 'unsupported_team_action' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'role',role,'approved',approved,'permissions',coalesce(permissions,'{}'::jsonb)
  ) into v_after
  from public.staff_profiles where id = p_target_user_id;

  insert into public.admin_team_audit(actor_id,target_user_id,action,before_state,after_state)
  values (p_actor_id,p_target_user_id,p_action,v_before,v_after);

  return jsonb_build_object('ok',true,'target_user_id',p_target_user_id,'action',p_action,'state',v_after);
end;
$$;

revoke all on function public.owner_manage_team_member(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.owner_manage_team_member(uuid,uuid,text,jsonb) to service_role;
