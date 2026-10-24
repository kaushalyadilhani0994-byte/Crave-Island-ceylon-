-- CRAVE ISLAND CEYLON — manual security hardening record
-- Applied to production Supabase on 2026-10-24 and verified afterward.
-- This is a record/runbook, not an automatically applied numbered migration.
--
-- RLS controls rows, but it does not protect against TRUNCATE. The public
-- application roles do not need table-maintenance privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

-- Keep the same unnecessary privileges off tables created by postgres later.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLES FROM anon, authenticated;

-- NOTE: Altering default privileges for the internal supabase_admin role
-- returned PostgreSQL 42501 (permission denied). Existing public tables were
-- still hardened successfully. Re-check platform defaults when creating new
-- public tables; grant only the minimum required privileges and keep RLS on.
