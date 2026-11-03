-- Remove Data API table privileges for anonymous users from internal cron
-- metadata and Storage object metadata. Public bucket object downloads continue
-- to use the Storage public-object endpoint; they do not require table grants.
revoke all on table cron.job from anon;
revoke all on table cron.job_run_details from anon;
revoke all on table storage.objects from anon;
