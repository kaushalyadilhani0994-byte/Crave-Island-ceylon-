# Owner team-management backend draft — 2026-10-31

## Scope and safety

This is an isolated review-branch implementation. It has not been applied to the live Supabase project, deployed, merged, or connected to the existing Admin UI. The existing Admin layout, OTP flow, navigation, and owner account are unchanged.

## Verified live schema used

The current `staff_profiles` table contains:

- `id` UUID (auth user ID)
- `display_name` text
- `role` text
- `approved` boolean
- `created_at` timestamptz
- `permissions` JSONB
- `email` text

Current owner RLS policies allow approved owners to read/update staff profiles. The existing invite function creates only pending profiles for `supervisor`, `staff`, `media`, `accounts`, or `star_club`; it never invites an owner.

## Added review-only files

1. `supabase/functions/owner-manage-team-member/index.ts`
2. `supabase/migrations/202610310001_owner_team_management_audit.sql`

## Function contract

POST actions:

- `list`: returns only inviteable team roles, not owner profiles.
- `approve`: approves a pending team member.
- `suspend`: sets `approved=false`, revoking staff access without deleting their account or history.
- `set_permissions`: replaces a validated permission map.

The Edge Function validates the caller's bearer token, resolves the user through Supabase Auth, and independently checks that the caller's staff profile is an approved owner. It uses the service-role client only after that check. The SQL RPC is executable only by `service_role`, checks the actor's approved-owner profile again, locks the target profile, rejects owner targets, validates role and permission module/action allowlists, and writes before/after state to an audit table in the same database transaction as the profile change.

Permission modules currently allow: `orders`, `inventory`, `catalogue`, `media`, `accounts`, `alerts`, `loyalty`.

Permission actions currently allow: `read`, `create`, `update`, `delete`, `approve`, `acknowledge`, `publish`, `export`.

## Static checks performed

- Verified Edge Function contains JWT user resolution and approved-owner check.
- Verified list is restricted to inviteable roles.
- Verified request cannot set or promote a role to owner.
- Verified SQL rejects owner targets.
- Verified permission modules/actions are allowlisted.
- Verified audit stores before/after state.
- Verified RPC execute grant is limited to service_role.
- JavaScript/TypeScript syntax parse: SyntaxError: Cannot use import statement outside a module.

## Not yet tested

- Deno type-check / Edge Runtime execution.
- SQL migration against an isolated Supabase database.
- End-to-end owner approval, suspension, permission update, and audit visibility.
- RLS behaviour and service-role RPC execution in a staging project.
- UI integration and role-by-role access checks.

## Required before production

1. Apply migration to a disposable/staging Supabase project and inspect the created policy/function privileges.
2. Run positive and negative tests, including customer/staff/owner caller checks, owner-target protection, malformed permissions, and audit rollback.
3. Confirm the existing app's role permission names align with the proposed allowlist before enabling granular staff controls.
4. Add a compact Team Management panel inside the existing Admin without replacing its current layout.
5. Deploy only after explicit owner approval and a verified rollback plan.

No live staff accounts, permissions, database rows, Edge Functions, or production deployment were changed.
