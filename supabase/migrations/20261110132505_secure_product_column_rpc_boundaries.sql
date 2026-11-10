-- Keep direct authenticated product reads limited to explicitly granted
-- customer-facing columns. Internal inventory/manufacturing fields are served
-- only through owner/team-checked RPCs.
CREATE OR REPLACE FUNCTION private.owner_list_products_impl()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_approved_owner() THEN
    RAISE EXCEPTION 'approved_owner_required' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT to_jsonb(p)
      FROM public.products p
     ORDER BY p.created_at DESC, p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.team_list_inventory_impl()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_staff_permission('inventory', 'read')
    OR private.has_staff_permission('inventory', 'update')
  ) THEN
    RAISE EXCEPTION 'approved_inventory_read_required' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'category', p.category,
      'stock_quantity', p.stock_quantity,
      'low_stock_threshold', p.low_stock_threshold,
      'track_inventory', p.track_inventory,
      'expiry_date', p.expiry_date,
      'manufacturing_date', p.manufacturing_date,
      'storage_location', p.storage_location,
      'batch_number', p.batch_number,
      'sku', p.sku,
      'is_active', p.is_active,
      'updated_at', p.updated_at
    )
      FROM public.products p
     ORDER BY p.name, p.id;
END;
$function$;

REVOKE ALL ON FUNCTION private.owner_list_products_impl() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.team_list_inventory_impl() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owner_list_products_impl() TO authenticated;
GRANT EXECUTE ON FUNCTION private.team_list_inventory_impl() TO authenticated;

-- Public RPC wrappers remain SECURITY INVOKER; the private implementations
-- perform explicit identity/permission checks before returning restricted data.
CREATE OR REPLACE FUNCTION public.owner_list_products()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.owner_list_products_impl();
$function$;

CREATE OR REPLACE FUNCTION public.team_list_inventory()
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT * FROM private.team_list_inventory_impl();
$function$;

-- Remove broad table-level SELECT while preserving customer-facing column grants.
REVOKE SELECT ON TABLE public.products FROM authenticated;
