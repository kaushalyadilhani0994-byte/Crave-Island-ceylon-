-- Restore the SQL SELECT privilege required for the public product catalogue.
-- RLS remains enabled: anon can read active products only; authenticated users
-- remain constrained by the existing owner/team/customer product SELECT policies.
grant select on table public.products to anon, authenticated;
