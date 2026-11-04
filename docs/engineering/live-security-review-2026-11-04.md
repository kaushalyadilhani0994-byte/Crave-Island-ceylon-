# CRAVE ISLAND CEYLON — live security and launch review
Date: 2026-11-04
Scope: read-only verification of the live Supabase project and review-branch source. No production storefront, schema, policy, product, order, or deployment was changed during this review.

## Live database checks

- Confirmed the approved owner profile exists and is marked approved. Owner identity remains governed by the live `staff_profiles` row plus the authenticated session; do not widen the email allowlist as a substitute.
- Confirmed `create_store_order_atomic(uuid,uuid,jsonb)` is SECURITY DEFINER and executable only by `service_role` (plus postgres owner). It checks the service-role JWT claim, validates the payload, locks product rows, recalculates prices, enforces active category/product and expiry/stock checks, and commits order header, order lines, stock reservation and idempotency record in one transaction.
- Confirmed `owner_update_store_order_status(uuid,text)` is SECURITY DEFINER and executable only by `service_role` (plus postgres owner). The Edge Function validates a real authenticated approved team member and permissions before calling it.
- Confirmed owner product-save implementation is SECURITY DEFINER, uses an empty search_path, and checks `auth.uid()` plus `private.is_approved_owner()` before any write. Its public wrapper is SECURITY INVOKER. Authenticated execute on the private implementation is therefore guarded by the owner check; do not remove that check.
- Tested with SQL role `anon`: active category rows visible = 14; active products visible = 0; published passports linked to active products visible = 0; product/category image Storage objects visible = 0.
- Anonymous access to `store_orders` and `staff_profiles` was denied at the table privilege layer (permission denied), not merely filtered to zero rows.
- Live counts show the customer-facing catalogue currently has no active products and no published product passports. This is consistent with a not-yet-populated launch catalogue, not evidence of a QR failure.

## Security Advisor interpretation (2026-11-04)

- `public.owner_report_cron_config`: RLS enabled without policies. Keep it closed; the scheduled function uses server-side service credentials. Do not add a public policy to silence the linter.
- `cron.job` and `cron.job_run_details`: Advisor reports generic anonymous policies. The `cron` schema has no USAGE for `anon`; the objects are not exposed through the app Data API. Table owner is `supabase_admin`, not the SQL role used by the migration runner. The attempted revoke migration did not change the underlying ACL. Do not claim this is fixed; if desired, remove/review through a database-owner-level maintenance path.
- Warnings for `authenticated` policies are generic because Supabase anonymous Auth sessions also use the Postgres `authenticated` role. The inspected policies are predicate-scoped (auth.uid ownership, approved owner, or explicit staff permission). The order-creation function separately rejects `user.is_anonymous`. Keep these predicates; do not blindly drop them.
- Storage object table privileges include anon, but the private image-bucket RLS policy restricts rows to approved owners; the live anon read test returned zero objects. Buckets remain private. Public storefront image delivery still needs an intentional design decision before launch.
- Leaked Password Protection remains DISABLED in Supabase Auth. Enable it in Dashboard → Authentication → Settings → Password Security before public launch. The frontend HaveIBeenPwned k-anonymity check is supplementary and is not equivalent.

## Remaining launch gates

1. Enable Supabase Auth leaked-password protection in the dashboard.
2. Resolve the privileged-owner ACL question for cron metadata only if required by the platform exposure model; do not broaden access.
3. Decide how product/category images will be served publicly while retaining owner-only upload controls.
4. Populate and verify real active products and published passports; then physically scan a product QR on a phone.
5. Complete real mobile owner sign-in/Admin visibility testing and implement/test the separate role-specific staff login/workspaces. Staff OTP/workspaces are not complete.
6. Complete controlled checkout, cancellation/restock, customer receipt, WhatsApp/Sheets delivery, delivery-charge and post-delivery-feedback tests. COD is the only currently implemented payment method and delivery fee is currently LKR 0.
7. Verify a fresh Vercel preview for the exact review-branch commit before considering merge. Do not merge or promote to production until all launch gates pass.

## Preservation rule

Keep the existing V18 storefront and original Owner Control Room intact. No production deployment, domain alias change, destructive policy change, or live customer/order mutation is authorized by this review.

## Team and storefront readiness snapshot

- Current live `staff_profiles` aggregation: 1 approved owner; 0 Supervisor, Staff, Media, Accounts, or Loyalty members. There are therefore no real staff accounts with which to validate role-specific OTP/workspace isolation yet.
- The customer-facing live catalogue currently has 14 active categories but 0 active products and 0 published passports attached to active products. Public product/passport QR testing must wait until a real product is safely added and published.
- `private.has_staff_permission(module, action)` checks `auth.uid()`, `approved = true`, and either owner role or the exact permission in the profile JSON. `private.is_approved_owner()` separately checks the owner role and approval flag. This is the intended RLS boundary; do not replace it with client-side role labels.
