-- Cron metadata and run logs are internal operations data, not a public API.
-- The cron schema remains inaccessible to anon/authenticated; remove inherited PUBLIC ACLs as defense in depth.
revoke all privileges on table cron.job from public, anon, authenticated;
revoke all privileges on table cron.job_run_details from public, anon, authenticated;
