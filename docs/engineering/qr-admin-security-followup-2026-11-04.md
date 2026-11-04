# CRAVE ISLAND CEYLON — 2026-11-04 QR, Admin and Security Follow-up

## Scope and safety
This is a read-only production inspection plus review-branch source changes. No production database migration, product/order edit, Edge Function deployment, merge, or Vercel deployment was performed.

## Confirmed live owner identity
- The live `staff_profiles` row confirms `kaushalyadilhani0994@gmail.com` is the single approved owner.
- The owner auth frontend allowlist matches this address.
- The team-invitation Edge Function source has been narrowed to this same verified address; the live deployed function remains unchanged until an approved deployment.

## Critical product-column grant finding
- Live RLS is enabled on `public.products`, and active-product row policies are present.
- However, live table-level SELECT grants exist for both `anon` and `authenticated`.
- The products table includes operational fields such as stock quantity, low-stock threshold, inventory tracking, expiry date, SKU, manufacturing date, storage location, and allergen information. RLS limits rows, not columns; therefore an active product row could expose those operational fields to browser roles.
- The live migration history includes `restrict_authenticated_product_writes`, which revokes writes but re-grants table-level SELECT to `authenticated`. The earlier review-branch column-restriction migration is not present in production migration history.
- Review-branch migration `202611040002_restrict_public_product_columns.sql` revokes broad SELECT from anon/authenticated/PUBLIC and grants only storefront-safe columns to anon/authenticated.
- Do not describe this exposure as fixed until that migration is reviewed, applied, and verified in production.

## QR and owner product flow staged
- `owner_list_products()` is absent from the live database. The owner catalogue and passport editor now depend on it; migration `202611040001_owner_list_products_rpc.sql` creates an approved-owner-only SECURITY DEFINER RPC with an empty search_path.
- Migration `202611040003_team_inventory_read_rpc.sql` creates a separate limited inventory projection for approved staff with `inventory.read`, preserving staff inventory reads after broad product SELECT is removed.
- Product creation remains a hidden draft. The product-save RPC creates/updates the product, creates or updates its passport record, and stores the public passport URL/QR destination together.
- Product activation checks verified sale details, active category/parent, expiry, and the existence of a passport/QR.
- Public passport page reads only a published passport and requires an active linked product.
- QR label print handling was hardened for cached image loads; this is static source work only.

## Live catalogue snapshot
- Categories: 60 total, 14 active.
- Products: 1 total, 0 active.
- Product passports: 1 total, 0 published.
- Orders: 0.
- The existing prototype/draft remains untouched. There is no real public product QR available for an end-to-end scan yet.

## Live Edge Function versions
- `create-store-order`: ACTIVE v14 — validates registered user JWT and uses atomic order RPC/idempotency key.
- `update-order-status`: ACTIVE v6 — validates approved staff permissions and uses the order-status RPC.
- `owner-alert-notify`: ACTIVE v11.
- `owner-invite-team-member`: ACTIVE v2 — still deployed with its previous allowlist until an approved function deployment.
- `update-product-inventory`: ACTIVE v3 — validates approved staff inventory.update permission and inventory field payloads.
- The deployed functions were not changed during this follow-up.

## Security Advisor
- `public.owner_report_cron_config`: RLS enabled with no policies. Keep closed; scheduled service-role access is intentional.
- Generic anonymous-policy warnings cover cron metadata, owner/customer/team policies, and private storage. The public-schema policies inspected are scoped to `auth.uid()`, approved owner, or explicit staff permission; do not delete them just to silence the advisor.
- Native Supabase leaked-password protection is still DISABLED. The browser-side password breach check is supplementary, not equivalent. Owner must enable it in Authentication → Settings → Password Security before public launch.

## Remaining acceptance and launch gates
1. Review and apply the three migrations in numeric order, then verify anon/authenticated can read only storefront-safe product columns and approved owner/team RPCs return only their permitted projections.
2. Run owner OTP and original V18 Control Room navigation tests on a real phone.
3. Enter only verified real product facts; test draft → passport save → activation → passport publish → QR print → physical scan.
4. Complete role-specific staff OTP login/workspaces. Team invitation/profile/permission backend exists, but separate role-specific login and workspaces are not yet complete.
5. Decide and implement secure product/category image upload and public image delivery; current form accepts external HTTPS URLs and private Storage buckets are not a public image delivery path.
6. Complete customer receipt, delivery pricing, notification retry/outbox, delivered timestamp and 48-hour feedback only after owner decisions and isolated tests.
7. Vercel preview deployment is currently rate-limited. The latest review-branch commit has no fresh preview; no live build/browser acceptance test can be claimed.

## Current release status
Not launch-ready. Source fixes are staged in GitHub PR #17. Production remains unchanged and protected until migration review, real-device acceptance, and explicit owner approval.


## Additional fixes staged after the initial follow-up
- `202611040004_order_delivered_timestamp.sql` adds a first-delivery timestamp and updates the status RPC to set it once, without resetting it on retries. Owner Orders and My Orders can display this timestamp.
- `202611040005_sync_product_passport_fields.sql` makes the passport editor update the matching product ingredients, allergens, batch, manufacturing date and expiry date in the same transaction as passport publication. This keeps storefront details, QR passport details, checkout expiry checks and inventory expiry alerts consistent. It also blocks publishing a passport with a past best-before date and validates text field lengths.
- `my-orders.html` now provides a customer-scoped printable receipt using stored order/item snapshots, including subtotal, delivery fee, total, delivery address, contact details and unit prices. It does not store customer PII in local storage.
- Owner Orders and My Orders display the delivered timestamp once the migration is applied.

These are review-branch changes only. They still require isolated SQL tests and a fresh browser preview before deployment.

- The passport editor/public page now also support an optional verified net-content / pack-size field (for example, `100 g` or `250 ml`); no weight or pack size is invented for the existing draft.
