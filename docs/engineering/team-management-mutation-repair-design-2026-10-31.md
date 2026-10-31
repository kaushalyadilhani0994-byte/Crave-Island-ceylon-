# Team Management mutation repair design — 2026-10-31

## Problem confirmed against live Supabase

The existing public owner_set_team_member_access function is SECURITY INVOKER and has EXECUTE for authenticated, but authenticated has no UPDATE privilege on public.staff_profiles. The function therefore cannot update a team member. A broad GRANT UPDATE is not an acceptable repair because the existing approved-owner RLS policy would allow direct table updates and bypass the RPC's validation/owner-target checks.

## Proposed least-privilege repair

Keep the public RPC name and argument signature so a future UI can call the same API:

public.owner_set_team_member_access(_user_id uuid, _role text, _approved boolean, _permissions jsonb)

Change its body to a SECURITY INVOKER wrapper that calls one private helper:

private.owner_set_team_member_access_with_audit(...)

The private helper should be SECURITY DEFINER with a pinned search_path and fully schema-qualified object references. It must independently check auth.uid() is non-null and that the matching staff_profiles row is role=owner and approved=true. It must not accept actor_id from the browser.

### Required transaction sequence

1. Validate target UUID and allowlisted role: supervisor, staff, media, accounts, star_club.
2. Validate permissions is a JSON object.
3. Use the exact live modules: catalogue, inventory, orders, dispatch, media, accounts, star_club, certificates, reports, tasks, settings.
4. Use the exact live actions: read, create, update, delete, approve, export.
5. Require read in any module that contains a non-read action.
6. Lock the target staff_profiles row FOR UPDATE.
7. Reject missing targets and any target whose role is owner.
8. Capture before-state JSON.
9. Update role, approved and permissions.
10. Capture after-state JSON.
11. Insert one audit row containing auth.uid(), target ID, action, before-state, after-state and timestamp.
12. Return success only after the transaction commits.

The audit insert and profile update must be in the same PostgreSQL transaction. Any error must roll both back.

## Audit table design

Create public.admin_team_audit with:
- id bigint generated identity primary key
- actor_id uuid not null (no auth.users FK, so history survives account deletion)
- target_user_id uuid not null (no auth.users FK)
- action text not null
- before_state jsonb not null
- after_state jsonb not null
- created_at timestamptz not null default now()

Enable RLS. Revoke INSERT/UPDATE/DELETE/TRUNCATE from anon and authenticated. Grant SELECT to authenticated with a policy requiring private.is_approved_owner(). The SECURITY DEFINER helper inserts as its owner. Do not expose the table to customers.

A separate owner-only read function or direct SELECT through the RLS policy can power the Admin audit history view.

## Private helper exposure

- Keep the private helper in the non-exposed private schema.
- Grant EXECUTE only as needed for the public wrapper to invoke it; the helper still performs its own auth.uid() approved-owner check.
- Do not add a broad UPDATE grant on staff_profiles.
- Keep the public wrapper SECURITY INVOKER and retain its current function signature.
- Run Supabase Security Advisor after the migration and verify the private schema is not in the exposed Data API schemas.

## Staging test matrix

- authenticated owner can update a pending team profile through the public RPC.
- authenticated owner cannot target an owner profile.
- authenticated non-owner cannot call the helper successfully.
- customer and anonymous callers cannot mutate.
- malformed JSON, unsupported role/module/action, missing read scope and missing target are rejected.
- audit row is created with actor derived from auth.uid(), not caller-supplied data.
- forced audit insert failure rolls back the profile mutation.
- direct authenticated INSERT/UPDATE/DELETE on audit table is denied.
- authenticated has no direct UPDATE privilege on staff_profiles before or after repair.
- existing owner_list_team_members continues to list only after owner check.

## Integration constraints

- Do not change the existing OTP login, owner email allowlist, owner navigation, dashboard structure, or customer UI.
- Add Team Management as one compact card/section inside the existing owner dashboard only after the backend passes staging tests.
- Do not send invitations or change staff permissions in production until the audit trail is active and the UI has been tested with dedicated staging accounts.
- Recover the exact five live team migration SQL files before adding a new migration, because live migration history currently differs from GitHub main.

## Status

Design only. No SQL applied, no Edge Function deployed, no staff invited, no team permissions changed, no production merge or deployment.
