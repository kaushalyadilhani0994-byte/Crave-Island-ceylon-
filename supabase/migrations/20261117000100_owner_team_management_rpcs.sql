-- CRAVE ISLAND CEYLON: complete the owner-only Team & Roles RPC contract.
-- The UI already calls these public RPC names. Keep all profile listing and
-- role mutation behind the primary-owner guard and a narrow returned column set.

CREATE OR REPLACE FUNCTION private.owner_list_team_members_impl()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_approved_owner() THEN
    RAISE EXCEPTION 'owner_access_required' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
      'user_id', sp.id,
      'email', sp.email,
      'display_name', sp.display_name,
      'role', sp.role,
      'approved', sp.approved,
      'permissions', coalesce(sp.permissions, '{}'::jsonb)
    )
    FROM public.staff_profiles AS sp
    ORDER BY CASE WHEN sp.role = 'owner' THEN 0 ELSE 1 END,
             lower(coalesce(sp.display_name, sp.email, '')),
             sp.id;
END;
$function$;

REVOKE ALL ON FUNCTION private.owner_list_team_members_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owner_list_team_members_impl() TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_list_team_members()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.owner_list_team_members_impl();
$function$;

REVOKE ALL ON FUNCTION public.owner_list_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_list_team_members() TO authenticated;

-- Expose only a guarded invoker wrapper for the existing private mutation.
REVOKE ALL ON FUNCTION private.owner_set_team_member_access_impl(uuid, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owner_set_team_member_access_impl(uuid, text, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_set_team_member_access(
  _user_id uuid,
  _role text,
  _approved boolean,
  _permissions jsonb
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.owner_set_team_member_access_impl(_user_id, _role, _approved, _permissions);
$function$;

REVOKE ALL ON FUNCTION public.owner_set_team_member_access(uuid, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_team_member_access(uuid, text, boolean, jsonb) TO authenticated;
