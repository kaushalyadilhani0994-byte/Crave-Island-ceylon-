-- Keep owner and inventory RPCs protected by the existing table RLS policies.
-- Both functions already validate the caller's owner/team permissions. They do
-- not need SECURITY DEFINER to read products: the table policies grant the
-- approved owner or permitted inventory team access. This removes the linter
-- warning without broadening any table privileges.
ALTER FUNCTION public.owner_list_products() SECURITY INVOKER;
ALTER FUNCTION public.team_list_inventory() SECURITY INVOKER;
