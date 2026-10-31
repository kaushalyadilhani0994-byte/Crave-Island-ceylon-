# Live Team Management backend audit — 2026-10-31

## Executive result

The live Supabase database already contains a team-permission backend. The earlier review-only `owner-manage-team-member` Edge Function and its migration were a duplicate implementation with a permission contract that did not match the live database. Those two draft files have been removed from this review branch. Do not deploy or merge them.

The next safe work is to reconcile the live schema migration history with GitHub, add transactional audit logging to the existing backend, then integrate a compact Team Management panel into the existing owner dashboard without changing its OTP or navigation.

## Live database facts (read-only verified)

### Staff profile schema

`public.staff_profiles` columns:
- `id` UUID
- `display_name` text
- `role` text
- `approved` boolean
- `created_at` timestamptz
- `permissions` JSONB
- `email` text

Current live rows: one approved owner profile only. No team accounts were created by this audit.

### Existing database functions

- `public.owner_list_team_members()` returns user_id, email, display_name, role, approved, permissions, created_at; filters through `private.is_approved_owner()`.
- `public.owner_set_team_member_access(_user_id uuid, _role text, _approved boolean, _permissions jsonb)` validates owner status, role, JSON shape, module/action allowlists, and requires read permission whenever a non-read action is assigned. It updates only non-owner profiles.
- Both public functions are SECURITY INVOKER and have EXECUTE granted to authenticated; the mutation function independently checks `private.is_approved_owner()`.
- `private.has_staff_permission(module, action)` is SECURITY DEFINER with pinned search_path; it checks `auth.uid()`, approved profile state, owner role or the requested JSON permission.
- `private.is_approved_owner()` is SECURITY DEFINER with pinned search_path and checks `auth.uid()`, role owner, approved true.

### Actual permission contract (must be used by any UI)

Modules:
`catalogue, inventory, orders, dispatch, media, accounts, star_club, certificates, reports, tasks, settings`

Actions:
`read, create, update, delete, approve, export`

Any action other than read requires read to be present in the same module's action array.

This is the actual live contract. The earlier review draft's modules/actions were wrong and have been removed.

### Existing invite Edge Function

`owner-invite-team-member` v1 is ACTIVE with JWT verification enabled.
- Resolves bearer token with Supabase Auth.
- Checks the caller's live profile is an approved owner using service role.
- Allows only supervisor, staff, media, accounts, star_club.
- Sends an Auth invite, then upserts a pending staff profile with `approved=false` and empty permissions.
- Does not permit inviting/promoting an owner.

Risk to address before production UI: invite and profile upsert are separate operations. If the Auth invite succeeds but profile upsert fails, the function returns an error but the invited Auth identity remains. Add compensating cleanup or a recoverable pending-invite state and do not blindly retry invites.

## UI inspection

- The existing owner dashboard in `supabase-admin-auth.js` contains four cards: Owner Products, Owner Categories, Owner Orders, Owner QR Passport.
- Repository code search found no caller of `owner_list_team_members` and no Team Management UI.
- Existing OTP and owner approval checks remain the only way into the owner dashboard. Do not replace these.
- The requested Team Management entry should be an additional compact card/section inside this existing dashboard. Do not add a customer-visible navigation item or a second dashboard.

## Missing audit trail

No public or private team audit table was found in the live database. The live `owner_set_team_member_access` RPC updates role/approval/permissions without writing a before/after audit record. This is a launch blocker for granting staff privileges because accidental permission changes cannot be reconstructed reliably.

The earlier draft audit migration/function was removed because it duplicated the live function contract and had the wrong allowlist. Design the audit addition against the exact live contract and keep it in review until staging validation.

## Migration drift

The live Supabase migration history contains these team-related migrations:
- `20261031025555 add_team_permissions_and_rls_access`
- `20261031025613 secure_team_permission_rpc_as_invoker`
- `20261031025621 remove_auth_users_join_from_team_list_rpc`
- `20261031025842 require_read_scope_for_team_actions`
- `20261031025852 fix_team_permission_read_scope_validation`

The GitHub `main` `supabase/migrations` directory does not contain matching migration files. This is migration-history drift. Do not create/apply another migration or merge a new migration until the source SQL for these live migrations has been recovered and committed to the repository in order.

## Related role-enforcement findings

- `update-order-status` v5 checks approved team profile and accepts `orders.update` or `dispatch.update`; dispatch-only users are limited to processing → shipped and shipped → delivered. `accounts.update` does not grant status changes in this function even though a broad RLS policy mentions accounts.
- `update-product-inventory` v2 requires an approved team profile and owner or `inventory.update`.
- The live v2 expiry-date regex is over-escaped in the deployed source (`/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/` as returned by the source API), so valid ISO dates may be rejected. The corrected review-branch source must remain isolated until tested and approved.
- `supabase-admin-orders.js` currently queries the orders table directly and presents the Owner Orders tool only to an approved owner; the server function separately supports permitted dispatch staff. UI and backend role access are not yet aligned.

## Security Advisor snapshot

Read-only Supabase Security Advisor results:
- Leaked-password protection disabled (WARN).
- RLS enabled without policy on `public.owner_report_cron_config` (INFO); this is intentional if only service-role/cron code accesses it, but verify grants.
- Anonymous-access advisor warnings include policies that explicitly check approved owner/customer identity; these are false positives from policy expressions unless anonymous sign-in is enabled. Verify anonymous-auth setting and grants before changing any policies.
- Multiple permissive policies are reported across catalogue, passports, staff, and order tables. Do not remove them without proving the combined owner/team/customer access semantics.
- Performance advisor reports unused indexes and duplicate permissive policies; no index was removed.

## Required next gates

1. Recover and commit the five live team migration SQL files, matching the exact live versions.
2. Add an audit table and transactional before/after logging to the existing owner mutation path, preserving the live module/action contract.
3. Fix invite partial-failure handling.
4. Fix and test the inventory expiry-date validator in isolation.
5. Build the Team Management panel inside the existing owner dashboard on the review branch only.
6. Test owner/customer/staff role matrix in a disposable Supabase branch or staging project.
7. Only then request explicit approval for production migration/deployment.

## No production changes

This audit was read-only. No migration applied, no Edge Function deployed, no staff invite sent, no team profile changed, no product/order/inventory changed, no owner email/auth setting changed, no merge, and no Vercel deployment.
