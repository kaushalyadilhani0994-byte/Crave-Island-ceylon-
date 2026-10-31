# Launch-readiness review — 2026-10-31

Status: read-only audit notes on `review/atomic-order-idempotency`. No production application files, database rows, schema, Edge Functions, Admin layout, products, categories, QR pages, or deployment settings were changed.

## Daily owner report — verified delivery

- Scheduled job `crave-daily-owner-report-8pm` remains active at `30 14 * * *` UTC (20:00 Sri Lanka).
- The cron run on 2026-10-31 at 14:30:00 UTC completed successfully.
- The associated `net._http_response` record returned HTTP 200 with `{"sent":true,"ordersToday":0,"activeProducts":0,"activeMainCategories":14,"openAlerts":0}`.
- This is direct evidence that the daily summary function reported Telegram delivery success for the 2026-10-31 run. The report contained counts only and no customer contact details.
- The minute-by-minute alert dispatcher also returned HTTP 200 with `processed:0, sent:0, failed:0` at 14:32 UTC. This means there were no pending open alerts to deliver at that run; it is not evidence of a failed Telegram delivery.
- One dispatcher HTTP request at 14:31 timed out at the pg_net 5-second limit, but the next run at 14:32 succeeded. The daily summary request itself succeeded independently.

## Checkout review — confirmed current implementation

Deployed `create-store-order` is ACTIVE, version 12, with JWT verification enabled. Source review confirms:

- Registered signed-in accounts only; anonymous sessions are rejected.
- Server-side validation of customer delivery fields, COD-only payment, unique product UUIDs, quantities, active products and categories, LKR prices, expiry, and tracked stock.
- Product prices and totals are recalculated on the server.
- Delivery fee is hard-coded to LKR 0 and disclosed in the checkout UI. Delivery rates need to be configured before launch.
- Order row and item rows are inserted in separate database requests. If item insertion fails, the function attempts to delete the order. This is not as strong as a single atomic transaction.
- The function accepts the `Idempotency-Key` header in CORS, but does not read or enforce it. The frontend does not send one. A retry after a lost response can therefore risk a duplicate order.
- Google Sheets and WhatsApp notifications are optional best-effort integrations. The function returns booleans for whether required configuration is present, but no real order has been placed to verify provider delivery.
- The checkout success view displays an order reference, total, payment method, status, and My Orders link. A PDF/email receipt was not verified.
- Online payment and bank transfer are not implemented; COD is the only accepted method.
- No two-day post-delivery feedback automation was verified.

## Public QR and passport review

- `shop-qr.html` is a standalone promotion QR page. It creates a QR destination from the current site origin and links to the storefront root.
- `passport.html` is a separate public read-only page. It validates a slug, queries only a published passport, then requires the related product to be active. It does not load Owner Admin scripts.
- Source review does not replace a physical phone scan. Product-specific QR generation/printing still requires a real published product passport; no test product was created and no QR was physically scanned.

## Security Advisor interpretation

The 2026-10-31 Security Advisor run reported:
- Leaked Password Protection disabled (Supabase native feature; the existing frontend HIBP k-anonymity check is only a supplementary signup-path control, not equivalent server-side Auth protection).
- `owner_report_cron_config` has RLS enabled without policies. It is accessed by the scheduled Edge Function using the server-side service role; do not add public policies just to silence the lint.
- Advisor anonymous-access warnings include `cron.job` and `cron.job_run_details`, whose policies use `CURRENT_USER`; prior grant inspection found access granted only to postgres. The cron schema is not exposed through the app Data API. These warnings should be interpreted alongside schema exposure and grants, not “fixed” by deleting existing cron policies.
- Other warnings label policies targeting `authenticated` as anonymous-capable because Supabase anonymous sign-ins use that Postgres role. Review actual predicates and ensure every authenticated policy still requires a real user/ownership/approved-role check where appropriate. Do not blindly delete policies or rewrite existing RLS.
- Approved-owner access to `admin_alerts` is restricted through `private.is_approved_owner()`.

## Remaining launch blockers / decisions

1. Implement and test atomic order creation + idempotency in isolation before considering production.
2. Decide and configure delivery rates; do not advertise free delivery while the backend remains at zero unless that is an intentional business decision.
3. Confirm WhatsApp and Google Sheets secrets/configuration and provider delivery without exposing secret values.
4. Build/verify customer receipt delivery.
5. Build/verify two-day feedback follow-up.
6. Verify checkout with a controlled test product and test customer only after explicit approval.
7. Physically scan the shop QR and a product passport QR after a real passport is published.
8. Re-run security review after any approved changes.

## Preservation rules

Keep the production URL, current storefront, Owner Admin layout, existing navigation, QR/login behaviour, products, categories, and all production records unchanged. No merge or production deployment is authorized by this audit note.
