# Team-management draft validation — 2026-10-31

## Validation performed

The isolated owner team-management draft was reviewed and checked without touching production data.

### Passed checks

- Node.js v22 TypeScript syntax check using `node --experimental-strip-types --check` on the Edge Function source: passed.
- Edge Function has explicit POST-only handling and OPTIONS preflight.
- Missing bearer token is rejected with 401.
- Supabase Auth resolves the bearer token with `auth.getUser()`; invalid sessions are rejected with 401.
- Actor must have `staff_profiles.role = owner` and `approved = true`; otherwise 403.
- List action is restricted to the inviteable roles: supervisor, staff, media, accounts, star_club.
- Mutation action allowlist is exactly approve, suspend, set_permissions.
- Target must be a UUID.
- Function does not accept a requested role and cannot promote anyone to owner.
- Mutations are delegated to a service-role-only SQL RPC; the SQL RPC repeats the approved-owner check and locks the target profile.
- SQL RPC rejects owner targets and unsupported roles.
- Permission modules/actions are allowlisted and permission values must be arrays.
- Before/after state is written to the audit table in the same transaction as the profile change.
- Audit table has RLS and an approved-owner SELECT policy; anon/authenticated direct writes are revoked.
- SQL RPC execute privilege is revoked from public/anon/authenticated and granted only to service_role.
- Internal database error details are not returned to the browser.
- Migration version collision was found and corrected: the team migration now uses `202610310003`, after existing `202610310001` and `202610310002`.

## Test matrix for staging

| Scenario | Expected result |
|---|---|
| No bearer token | 401 |
| Invalid/expired session | 401 |
| Customer account | 403 |
| Unapproved staff | 403 |
| Approved non-owner staff | 403 |
| Approved owner list request | 200; only inviteable roles returned |
| Owner approves pending staff | approved becomes true; audit row added |
| Owner suspends staff | approved becomes false; audit row added |
| Owner assigns valid permissions | JSONB permissions replaced; audit row added |
| Attempt to modify owner target | rejected; no state change |
| Attempt to set unsupported role | rejected |
| Unknown permission module/action | rejected |
| Permission module value is not array | rejected |
| Missing target | 404/rejected |
| Malformed UUID | 400 |
| Audit insert failure | profile mutation rolls back with transaction |
| Browser tries direct audit INSERT/UPDATE/DELETE | denied |
| Anonymous caller tries RPC | denied |

## Not yet passed / not executed

- No isolated Supabase staging project is currently available in this workflow; therefore the migration has not been applied anywhere.
- No PostgreSQL parser/catalog validation has been run.
- No Deno runtime execution or live HTTP integration tests have been run.
- No real owner/staff test identities have been created.
- No UI integration or role-permission end-to-end test has been run.

## Important compatibility gate

The current database permission helper expects JSON shaped as `{ module: ["action", ...] }`. The proposed module/action allowlist is a draft contract. Before enabling UI controls, verify each permission against the actual owner/staff UI and backend action callsites. Do not assume a permission is enforced just because it is stored.

## Deployment status

Review branch only. Not merged, not deployed, no migration applied, no Edge Function replaced, no invitations sent, no staff approvals/permissions changed, and no production Admin layout/auth/navigation changes.
