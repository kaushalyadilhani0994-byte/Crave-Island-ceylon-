# Team Management validation status — 2026-10-31

## Live read-only checks completed

- Confirmed `staff_profiles` schema and current profile count (one approved owner; no staff test accounts).
- Inspected live definitions and grants for `owner_list_team_members`, `owner_set_team_member_access`, `private.has_staff_permission`, and `private.is_approved_owner`.
- Confirmed both public owner RPCs are SECURITY INVOKER and executable by authenticated users; the mutation RPC independently calls the approved-owner check.
- Confirmed the actual live permission modules/actions and read-scope validation.
- Confirmed the active `owner-invite-team-member` v1 Edge Function verifies bearer JWT and approved owner, restricts roles, and creates pending profiles.
- Confirmed there is no team audit table in public/private schemas.
- Confirmed no Team Management UI or callsite for `owner_list_team_members` exists in the current main source.
- Confirmed five team-related migrations are present in live Supabase migration history but their SQL files are missing from GitHub main migration directory.
- Confirmed no staging Supabase branches exist.
- Reviewed active `update-order-status` v5 and `update-product-inventory` v2 role enforcement.
- Identified an over-escaped ISO expiry-date regex in live inventory function v2; corrected source remains review-only.

## Blocking gaps

1. Migration history drift must be reconciled before any new migration.
2. Team permission changes currently have no before/after audit trail.
3. Invite creation and staff-profile upsert are separate; partial failure can leave an invited Auth user without a profile.
4. Existing UI is owner-only and does not expose Team Management.
5. No staff test identities exist; role-based positive/negative integration tests cannot be run without staging identities.
6. No staging Supabase branch exists; creating one may incur usage charges, so none was created.

## Required staging test matrix

| Test | Expected |
|---|---|
| Anonymous caller invokes owner list/mutation RPC | denied |
| Customer invokes owner list/mutation RPC | denied |
| Unapproved staff invokes owner list/mutation RPC | denied |
| Approved non-owner staff invokes owner list/mutation RPC | denied |
| Approved owner lists members | allowed; no owner mutation controls |
| Owner invites each permitted role | invite created, profile pending, empty permissions |
| Invite/profile upsert failure | compensating cleanup or recoverable state; no silent orphan |
| Owner approves member | approved=true and audit before/after row |
| Owner suspends member | approved=false and audit row |
| Owner changes permissions | only live allowlist; read required for write actions; audit row |
| Owner attempts to target owner profile | denied |
| Unsupported role/module/action | denied |
| Non-owner writes audit table directly | denied |
| Audit insert fails | role/permission update rolls back |
| Customer reads another customer's orders | denied |
| Dispatch-only staff updates processing→shipped | allowed |
| Dispatch-only staff confirms/cancels order | denied |
| Orders-update staff follows allowed transition matrix | allowed |
| Inventory staff updates valid stock/date | allowed |
| Invalid/impossible date | rejected |
| Inventory staff without inventory.update | denied |

## Not executed

- No staging database or branch was available.
- No live Edge Function request was sent using a test account.
- No real invitation, approval, suspension, permission mutation, order, or inventory mutation was performed.
- No Deno runtime integration test was run.
- No UI was changed or deployed.

## Deployment status

No live database changes, no Edge Function deployment, no staff invitations, no team permission changes, no product/order/inventory writes, no owner email/OTP changes, no production merge, and no Vercel deployment.