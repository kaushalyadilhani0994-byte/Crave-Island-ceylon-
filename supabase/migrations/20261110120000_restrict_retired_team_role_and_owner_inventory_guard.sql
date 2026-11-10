-- Only the four supported operational roles may be newly assigned.
-- Keep the legacy star_club permission module accepted so historical profiles
-- can still be read and migrated without granting the retired role again.
CREATE OR REPLACE FUNCTION private.owner_set_team_member_access_impl(
  _user_id uuid,
  _role text,
  _approved boolean,
  _permissions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_target public.staff_profiles%rowtype;
  v_permissions jsonb := coalesce(_permissions, '{}'::jsonb);
  v_module text;
  v_actions jsonb;
  v_action text;
  v_allowed_modules text[] := ARRAY[
    'catalogue','inventory','orders','dispatch','media','accounts',
    'star_club','certificates','reports','tasks','settings'
  ];
  v_allowed_actions text[] := ARRAY['read','create','update','delete','approve','export'];
BEGIN
  IF v_actor IS NULL OR NOT private.is_approved_owner() THEN
    RAISE EXCEPTION 'owner_access_required' USING errcode = '42501';
  END IF;

  IF _user_id IS NULL
     OR _role IS NULL
     OR _role NOT IN ('supervisor','staff','media','accounts')
     OR _approved IS NULL
     OR jsonb_typeof(v_permissions) <> 'object' THEN
    RAISE EXCEPTION 'invalid_team_member_or_permissions' USING errcode = '22023';
  END IF;

  FOR v_module, v_actions IN
    SELECT key, value FROM jsonb_each(v_permissions)
  LOOP
    IF NOT (v_module = ANY(v_allowed_modules)) OR jsonb_typeof(v_actions) <> 'array' THEN
      RAISE EXCEPTION 'invalid_permission_module' USING errcode = '22023';
    END IF;

    FOR v_action IN SELECT jsonb_array_elements_text(v_actions)
    LOOP
      IF NOT (v_action = ANY(v_allowed_actions)) THEN
        RAISE EXCEPTION 'invalid_permission_action' USING errcode = '22023';
      END IF;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_actions) AS a(value)
      WHERE jsonb_typeof(a.value) <> 'string'
    ) THEN
      RAISE EXCEPTION 'permission_actions_must_be_strings' USING errcode = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_actions) AS a(action)
      WHERE a.action <> 'read'
    ) AND NOT (v_actions ? 'read') THEN
      RAISE EXCEPTION 'read_permission_required_for_other_actions' USING errcode = '22023';
    END IF;
  END LOOP;

  SELECT * INTO v_target
  FROM public.staff_profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.role = 'owner' THEN
    RAISE EXCEPTION 'team_member_not_found_or_owner' USING errcode = 'P0002';
  END IF;

  UPDATE public.staff_profiles
     SET role = _role,
         approved = _approved,
         permissions = v_permissions
   WHERE id = _user_id;

  INSERT INTO private.staff_access_audit (
    actor_user_id, target_user_id,
    old_role, new_role, old_approved, new_approved,
    old_permissions, new_permissions
  ) VALUES (
    v_actor, _user_id,
    v_target.role, _role, v_target.approved, _approved,
    coalesce(v_target.permissions, '{}'::jsonb), v_permissions
  );
END;
$function$;
