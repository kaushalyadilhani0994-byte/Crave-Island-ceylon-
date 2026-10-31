# Live Team Management backend audit — 2026-10-31

## Executive result

The live Supabase database already contains a team-permission backend. The earlier review-only owner-manage-team-member Edge Function and migration were duplicate implementations with the wrong permission contract. Those files have been removed from this review branch.

A critical live blocker was found: the owner mutation RPC is SECURITY INVOKER, but authenticated has no UPDATE privilege on staff_profiles. The list RPC can run, but approve/suspend/permission updates cannot complete. There is also no audit table, and the live migration history is not represented in GitHub main.

## Live database facts (read-only verified)

### Staff profile schema

public.staff_profiles columns:
- id UUID
- display_name text
- role text
- approved boolean
- created_at timestamptz
- permissions JSONB
- email text

Current live rows: one approved owner profile only. No team accounts were created by this audit.

### Existing database functions

- public.owner_list_team_members() returns user_id, email, display_name, role, approved, permissions, created_at; it filters through private.is_approved_owner().
- public.owner_set_team_member_access(_user_id uuid, _role text, _approved boolean, _permissions jsonb) validates owner status, role, JSON shape, module/action allowlists, and requires read permission whenever a non-read action is assigned. It updates only non-owner profiles.
- Both public functions are SECURITY INVOKER and EXECUTE is granted to authenticated.
- private.has_staff_permission(module, action) is SECURITY DEFINER with a pinned search_path and checks auth.uid(), approved status, owner role or the requested permission.
- private.is_approved_owner() is SECURITY DEFINER with a pinned search_path and checks auth.uid(), role owner, approved true.

### Critical mutation privilege blocker

A live privilege query returned:
- authenticated SELECT on staff_profiles: true
- authenticated UPDATE on staff_profiles: false
- authenticated EXECUTE on owner_set_team_member_access: true
- authenticated EXECUTE on owner_list_team_members: true

Therefore owner_list_team_members can read the team list, but owner_set_team_member_access cannot perform its UPDATE statement as an invoker. Team approval, suspension and permission updates are currently blocked.

Do not fix this by broadly granting UPDATE on staff_profiles. The existing approved-owner UPDATE RLS policy would then also permit direct owner table updates that bypass the RPC's target-owner protection and input validation. A safer design is a private SECURITY DEFINER mutation helper with explicit auth.uid() approved-owner checks, target-owner rejection, exact live allowlists, and transactional audit insertion; keep a public SECURITY INVOKER wrapper as the only browser-callable entry point.

### Actual live permission contract

Modules:
catalogue, inventory, orders, dispatch, media, accounts, star_club, certificates, reports, tasks, settings

Actions:
read, create, update, delete, approve, export

Any action other than read requires read to be present in the same module's action array.

This is the actual live contract. The earlier review draft used different module/action names and has been removed.

### Existing invite Edge Function

owner-invite-team-member v1 is ACTIVE with JWT verification enabled.
- Resolves bearer token with Supabase Auth.
- Checks the caller's live profile is an approved owner using service role.
- Allows only supervisor, staff, media, accounts, star_club.
- Sends an Auth invite, then upserts a pending staff profile with approved=false and empty permissions.
- Does not permit inviting or promoting an owner.

Risk: Auth invitation and profile upsert are separate operations. If invitation succeeds but profile upsert fails, the invited Auth identity remains without a staff profile. Add compensating cleanup or a recoverable pending-invite state before exposing repeated invitations.

## UI inspection

- The existing owner dashboard in supabase-admin-auth.js contains four cards: Owner Products, Owner Categories, Owner Orders, Owner QR Passport.
- Repository code search found no caller of owner_list_team_members and no Team Management UI.
- Existing OTP and owner approval checks remain the only way into the owner dashboard. Do not replace these.
- The requested Team Management entry should be an additional compact card/section inside this existing dashboard. Do not add a customer-visible navigation item or a second dashboard.

## Missing audit trail

No public or private team audit table was found in the live database. The live owner_set_team_member_access RPC updates role/approval/permissions without a before/after audit record. This is a launch blocker for granting staff privileges because accidental permission changes cannot be reconstructed reliably.

Design the audit addition against the exact live contract and keep it in review until staging validation.

## Migration drift

The live Supabase migration history contains these team-related migrations:
- 20261031025555 add_team_permissions_and_rls_access
- 20261031025613 secure_team_permission_rpc_as_invoker
- 20261031025621 remove_auth_users_join_from_team_list_rpc
- 20261031025842 require_read_scope_for_team_actions
- 20261031025852 fix_team_permission_read_scope_validation

The GitHub main supabase/migrations directory does not contain matching migration files. This is migration-history drift. Do not create/apply another migration or merge a new migration until the source SQL for these live migrations has been recovered and committed to the repository in order.

## Inventory date validator regression test

A direct source-level test compared deployed update-product-inventory v2 with the corrected review-branch source.

The deployed regex pattern was ^\\d{4}-\\d{2}-\\d{2}$ and rejected valid 2026-10-31 and 2024-02-29. The corrected pattern was ^\d{4}-\d{2}-\d{2}$ and accepted those valid dates while rejecting impossible 2025-02-29, invalid month 2026-13-01, and non-ISO 31-10-2026. The corrected source remains review-only.

## Related role-enforcement findings

- update-order-status v5 checks an approved team profile and accepts orders.update or dispatch.update. Dispatch-only users are limited to processing → shipped and shipped → delivered.
- accounts.update does not grant status changes in this Edge Function even though a broad RLS policy mentions accounts.
- update-product-inventory v2 requires an approved team profile and owner or inventory.update.
- The authenticated role has SELECT only on store_orders; no UPDATE privilege exists. The broad team UPDATE RLS policy therefore does not itself grant direct PostgREST writes. Preserve this safeguard.
- supabase-admin-orders.js currently presents Owner Orders only to an approved owner; the server function separately supports permitted dispatch staff. UI and backend role access are not yet aligned.

## Security Advisor snapshot

Read-only Supabase Security Advisor results:
- Leaked-password protection disabled (WARN).
- RLS enabled without policy on public.owner_report_cron_config (INFO); verify grants and service-role-only use.
- Anonymous-access advisor warnings include policies whose expressions check approved owner/customer identity. Verify anonymous-auth configuration and grants before changing any policies.
- Multiple permissive policies are reported across catalogue, passports, staff, and order tables. Do not remove them without proving combined owner/team/customer access semantics.
- Performance advisor reports unused indexes and duplicate permissive policies; no index was removed.

## Required next gates

1. Recover and commit the five live team migration SQL files, matching exact live versions.
2. Replace the currently nonfunctional invoker mutation body with a narrowly scoped private mutation helper, retaining the live module/action contract.
3. Add transactional before/after audit logging to the owner mutation path.
4. Fix invite partial-failure handling.
5. Keep the corrected inventory expiry-date validator isolated until staging tests and approval.
6. Build the Team Management panel inside the existing owner dashboard on the review branch only.
7. Test owner/customer/staff role matrix in a disposable Supabase branch or staging project.
8. Only then request explicit approval for production migration/deployment.

## No production changes

This audit was read-only. No migration applied, no Edge Function deployed, no staff invite sent, no team profile changed, no product/order/inventory changed, no owner email/auth setting changed, no merge, and no Vercel deployment.
