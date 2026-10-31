# Superseded Team Management draft — 2026-10-31

This document described an early draft implementation that has been removed from the review branch.

A read-only inspection of the live Supabase project found that Team Management backend functions and RLS policies already exist, with a different permission contract. The removed draft used incorrect module/action allowlists and would have duplicated the live implementation.

Use `docs/engineering/live-team-management-backend-audit-2026-10-31.md` as the current source of truth for:
- live `owner_list_team_members` and `owner_set_team_member_access` RPCs;
- actual allowed modules/actions;
- active `owner-invite-team-member` Edge Function;
- missing audit trail;
- migration-history drift;
- remaining security and UI work.

No production changes were made during this review.