# Team permission audit and daily expiry sweep — implementation draft

**Review branch only. Not applied to production.**

Read-only inspection on 2026-11-03 confirmed:
- The live owner mutation RPC is SECURITY INVOKER, while authenticated has no UPDATE privilege on staff_profiles. The function cannot currently change team access.
- Granting UPDATE directly to authenticated is unsafe because it could permit bypassing RPC validation.
- Live permission modules: catalogue, inventory, orders, dispatch, media, accounts, star_club, certificates, reports, tasks, settings.
- Live actions: read, create, update, delete, approve, export. Non-read actions require read in the same module.
- No team audit table exists.
- Product expiry alerts are currently refreshed only when a product is inserted or updated.
- pg_cron timezone is GMT/UTC. Existing owner report runs at 14:30 UTC (20:00 Sri Lanka).

## Repair design

1. Add owner-readable `admin_team_audit` with actor, target, before-state, after-state and timestamp. No foreign keys to auth.users, so audit history survives identity deletion.
2. Add a private SECURITY DEFINER mutation helper. It must derive actor from auth.uid(), independently check approved-owner status, validate the exact live role/module/action allowlists, lock the target row, reject owner targets, update role/approval/permissions and insert the audit row in one transaction.
3. Keep the public `owner_set_team_member_access(uuid,text,boolean,jsonb)` as a SECURITY INVOKER wrapper. Do not grant direct UPDATE on staff_profiles to authenticated.
4. Add a SECURITY DEFINER daily expiry sweep using the Asia/Colombo calendar date. It upserts expiry alerts for products expiring within 30 days, marks those within 7 days or already expired as critical, and resolves alerts when products are no longer within the 30-day window.
5. Schedule the sweep at 18:45 UTC (00:15 Asia/Colombo) under the existing pg_cron setup.

## Important migration-history blocker

Live Supabase lists five team migrations (20261031025555 through 20261031025852) whose SQL source files are missing from the repository. This draft must not be put into the executable migration directory or applied until those exact historical SQL files are recovered and the migration history is reconciled. This avoids creating a second divergent history.

## Invite endpoint repair

The review branch invite Edge Function now:
- fixes the email validator's escaped whitespace/dot regex;
- attempts to delete the newly invited Auth identity if the subsequent staff profile upsert fails;
- reports whether compensating deletion succeeded, so a failed cleanup can be manually recovered.

This does not invite anyone during this code change.

## Validation still required

- Apply SQL only in a disposable staging database after migration-history recovery.
- Test owner success; anonymous/customer/unapproved/non-owner denial; owner-target denial; every role/module/action validation; read-scope rule; transactional audit; audit-write failure rollback; direct audit-table write denial; no direct staff_profiles UPDATE grant.
- Test expiry dates at 31, 30, 8, 7, 1, 0, and -1 days relative to Asia/Colombo; verify alert severity, deduplication, resolution, and repeat execution.
- Verify cron job uniqueness and local run time.
- Run Deno check/tests for the invitation Edge Function and test both successful cleanup and cleanup failure.
- Do not deploy or merge until staging tests pass and explicit owner approval is given.

No production SQL, cron jobs, Edge Functions, staff accounts, or permissions were changed by this draft.
