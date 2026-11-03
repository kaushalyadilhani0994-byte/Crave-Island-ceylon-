# CRAVE ISLAND CEYLON — Deep order, stock, admin, security and QR audit

Review date: 2026-11-01  
Review branch: `review/atomic-order-idempotency`  
Scope: source review plus read-only inspection of the connected production Supabase schema, grants, RLS policies, constraints and triggers. No live rows, schema, functions, policies, secrets, deployments or customer notifications were changed.

## Executive result

The customer/admin row boundaries are mostly well designed: customers can read only their own orders; anonymous customers can read active products and published passports; approved owners can read all orders and manage alerts; order creation is routed through a service-role Edge Function rather than browser table inserts. However, the order lifecycle is not yet safe enough to call launch-ready.

## Critical / high-priority findings

### ORD-01 — Idempotency header is accepted but not enforced (HIGH)
`create-store-order` advertises `idempotency-key` in CORS and the browser/client path may retry after a network interruption, but the Edge Function never reads or persists the header. A successful database commit followed by a lost HTTP response can therefore produce a second order on retry. The frontend's `busy` flag only prevents a second click in the same live page execution; it cannot protect refreshes, reconnects or another device.

**Required correction:** persist a customer-scoped request key with a unique constraint and return the original order for a same-key/same-payload retry; reject key reuse with a different payload. This must be part of the same transaction as order creation.

### ORD-02 — Order header and order lines are separate requests (HIGH)
The Edge Function inserts `store_orders`, then separately inserts `store_order_items`, and attempts a compensating header delete if the second request fails. The live schema has `ON DELETE CASCADE`, and the order-item insert is a single bulk statement, but this still is not one transaction. A process interruption between requests can leave a header with no lines. There is also a narrow race where an owner can cancel an order after its header is inserted but before its lines are inserted.

**Required correction:** create header and lines inside one database transaction/RPC. Do not change the public checkout UX or COD-only behaviour while doing so.

### ORD-03 — Stock availability check and decrement are separate (HIGH, partially mitigated)
The Edge Function reads product stock before inserting order lines. Production has an AFTER INSERT trigger on `store_order_items` that performs a conditional atomic decrement (`stock_quantity >= quantity`) and raises `INSUFFICIENT_STOCK` if the final quantity is unavailable. This means simultaneous buyers should not both decrement the same insufficient stock successfully. However, the function does not translate this trigger error into a clear HTTP 409 in a dedicated way, and order creation still spans multiple requests.

**Required correction:** move final product/category/expiry/stock checks, row locks, order header, lines and stock reservation into one transaction. Keep the conditional decrement as a final database invariant or replace it with an equally safe row-locked implementation.

### ORD-04 — Cancellation restock and item-delete restock can double-credit stock (HIGH)
Production has two independent restock paths:
- `store_orders` AFTER UPDATE trigger restores each tracked product quantity when an order transitions to `cancelled`.
- `store_order_items` AFTER DELETE trigger restores the deleted line quantity.

If lines of an already-cancelled order are later deleted (including through an order cascade), both paths can restore the same quantity. This can inflate inventory. The browser has no order-item DELETE grant, but service-role maintenance/cascade operations remain capable of reaching this state.

**Required correction:** introduce an explicit, transactionally protected stock movement/reservation ledger or a single idempotent restock marker per order line. Cancellation and line deletion must never independently credit the same units. Do not test this against live orders.

### ORD-05 — Cancellation-before-lines race (HIGH)
Because the order header and lines are separate requests, an owner can transition the newly inserted header to cancelled before item insertion finishes. The cancellation trigger then sees no lines and restores nothing; the subsequent line insert can decrement stock for an order already marked cancelled. This is another reason the order header and lines must be atomic.

## Other order and stock observations

- Server recalculates item prices from active products; client-submitted totals are not trusted.
- COD is the only accepted method in the current Edge Function. Online payments are not implemented. The checkout UI's zero delivery fee is explicitly disclosed but must be configured before public launch.
- Quantities are bounded and duplicate product IDs are rejected.
- Expired product batches and inactive collections are rejected.
- Inventory decrement is conditional and transactionally executed by the database trigger for each inserted line.
- Order status updates verify the JWT and approved owner staff profile; compare-and-set update on the previous status prevents two concurrent transitions from both succeeding.
- Valid transitions are pending → confirmed/cancelled → processing → shipped → delivered. No cancellation after shipped.
- Status updates do not modify totals or payment state.
- Notification calls (WhatsApp/Sheets) are best-effort and have no durable retry/outbox confirmation. An order may exist even when external notification delivery fails.
- Customer receipt delivery and the 48-hour post-delivery feedback workflow are not verified.
- Customer checkout requires a registered, signed-in account. Anonymous sessions are rejected.
- No real order was created for this audit.

## Admin and security findings

### Positive controls confirmed in production
- `store_orders` and `store_order_items`: authenticated users have SELECT only; no browser INSERT/UPDATE/DELETE grants. Customer RLS limits reads to their own order; approved owner and permissioned team reads are policy-gated.
- `staff_profiles`: authenticated SELECT only. Own-profile and approved-owner policies are present. No authenticated UPDATE grant was present in the live grant inspection, so the broad-looking owner UPDATE policy does not itself provide a browser write path.
- `product_passports`: anon/authenticated SELECT only at the table-grant level; public RLS requires `published=true` and a matching active product. Owner/team mutation policies exist, but direct browser INSERT/UPDATE grants were absent in the earlier live privilege check. The new review-branch RPC migration is designed to keep writes behind approved-owner checks.
- `admin_alerts`: authenticated SELECT/UPDATE grants are present, with RLS requiring `private.is_approved_owner()` for both. No anon grant or policy was found.
- `products`: anonymous SELECT policy requires `is_active=true`; authenticated policies allow owner/team-scoped access. Existing product writes are protected by RLS.
- `update-order-status` independently validates the user JWT and checks `staff_profiles.role='owner'` and `approved=true` before applying a status transition.
- No service-role key is present in the inspected browser files.

### Admin issue requiring careful resolution
The current `supabase-admin-auth.js` owner email allowlist contains `kaushalyadilhani0994@gmail.com` and `kaushalyadhanidissanayake@gmail.com`. Project handover context records a corrected primary owner email spelling of `kaushalyadilhanidissanayake@gmail.com`. These strings do not match. This could explain inconsistent owner access, but no allowlist or auth setting was changed because the exact intended owner identity must not be guessed. The UI also applies a stricter email allowlist before checking the approved owner profile; the server-side profile approval remains authoritative for database access.

The currently inspected owner-auth module hides the legacy role selector and exposes the secure owner OTP form. This does not yet implement the requested role-specific Main Admin / Supervisor / Staff / Media / Accounts workflow. Do not broaden roles or add client-side trust; role-specific server permissions must be enforced at each database/API action.

### Further hardening required
- Verify all Edge Functions that use service role perform their own JWT, approval and permission checks; never rely on a hidden button or modal.
- For staff operations, ensure each endpoint checks the specific module/action permission and approved profile. Avoid broad table grants as a workaround.
- The live `store_orders` UPDATE policy permits permissioned team roles in RLS, but no authenticated UPDATE table grant was observed. This is currently fail-closed, though it may make team order update UI fail; any future grant must be narrowly scoped and paired with column-level or RPC restrictions so staff cannot change totals, payment state, customer identity or addresses.
- Confirm Auth leaked-password protection and redirect/template configuration separately; do not change owner OTP settings as part of this audit.

## QR passport findings

- Public `passport.html` accepts only a slug, reads a passport with `published=true`, then requires the linked product to be `is_active=true`. The public page does not expose unpublished passports or inactive products under the inspected RLS policy.
- Public page renders product name, collection and passport fields with HTML escaping; no customer or admin data is queried.
- Owner passport editor loads the existing passport before enabling Save; a failed read keeps Save disabled, protecting existing content from blank overwrite.
- Review-branch RPC migration keeps passport/product QR updates in one transaction, requires approved owner, validates payload lengths and dates, and refuses publishing an inactive product.
- QR URL uses the stable product UUID slug and the existing production domain. QR image generation currently calls a third-party QR image endpoint with the public passport URL; no private data is included in that URL, but a first-party QR renderer would reduce external dependency.
- Physical QR scanning, print sizing, and a real published product scan have not been tested.

## Review-branch work already present

- Atomic owner product + passport + QR save RPC migration and matching browser RPC calls.
- Owner passport publication RPC and safe-load/save interaction guards.
- Strict inventory Edge Function JSON/numeric/date validation.
- These are review-branch source changes only. The SQL migration has not been applied or executed against PostgreSQL.

## Release blockers / next engineering sequence

1. Build an atomic order-create RPC with customer-scoped idempotency, product row locks, category/expiry checks, server-side prices, header + lines and stock reservation in one transaction.
2. Design one idempotent stock-ledger/restock mechanism and remove the double-credit paths; include cancelled-before-lines impossible by transaction design.
3. Add a durable notification outbox and safe retry visibility for owner alerts/WhatsApp/Sheets.
4. Confirm and correct the owner email allowlist only after matching it to the actual approved owner account; preserve existing OTP flow until tested.
5. Implement team role operations with server-enforced per-module permissions; resolve order-update grants narrowly, not with broad table grants.
6. Validate the QR RPC SQL on an isolated PostgreSQL test target, then test owner create/edit/publish, public read gating, QR scan and print.
7. Run transaction, concurrency, duplicate retry, cancellation/restock, permission-denial and browser/mobile tests before any production release.

## Safety boundary
This audit performed read-only production SQL queries only. No production order, product, passport, staff, alert or inventory row was changed. No production SQL migration or Edge Function was deployed. No Vercel deployment, merge, PR, customer notification, or paid staging branch was created.


## Follow-up implementation staged on review branch — 2026-11-01

The following source changes are now staged on `review/atomic-order-idempotency`; they have **not** been applied to production Supabase or deployed:

- Added migration `202611010002_atomic_order_idempotency_stock_restock.sql`.
- Added a service-role-only transactional RPC for COD order creation. It rechecks active product/category, expiry, current prices and stock while holding product row locks, then inserts the order header and all order lines in the same transaction.
- Added customer-scoped idempotency keys and payload matching. A retry with the same key and same payload returns the existing order; reusing the key with different details is rejected.
- Updated the checkout client to retain a retry key for an uncertain request, storing only a SHA-256 payload fingerprint plus the key in session storage.
- Updated the Edge Function to call the atomic RPC before mutable stock checks, so a successful request whose HTTP response was lost can still replay even if its stock has since been reserved.
- Updated cancellation restock to use an order-level `stock_restocked_at` marker. The inventory trigger remains on line INSERT only; order-line DELETE is blocked so a later cascade/maintenance delete cannot double-credit stock.

### Verification still required before release

- Run the migration on an isolated PostgreSQL/Supabase test project and verify function syntax, grants and trigger ordering.
- Test simultaneous purchases for the last unit, same-key duplicate requests, same-key/different-payload rejection, rollback after line insert failure, cancellation restock once, and blocked line deletion.
- Verify the Supabase Edge Function forwards the custom `Idempotency-Key` header end-to-end.
- Add durable notification retry/outbox handling; current WhatsApp/Sheets notifications remain best-effort.
- Do not apply this migration to production until the isolated tests pass and the owner explicitly approves.


## Follow-up live verification — 2026-11-01

Read-only checks against the live Supabase project confirmed:

- The production order-item trigger is currently **AFTER INSERT OR DELETE** and calls `apply_order_item_inventory_delta()`. Its DELETE branch adds quantity back to tracked stock. The existing cancellation trigger also adds stock back on transition to cancelled. Therefore, deleting order lines and cancelling orders are two independent restock paths in the current live schema. The staged migration changes the item trigger to INSERT-only and adds a delete guard; this must be regression-tested with existing order history before release.
- The existing live `alert_order_issues()` definition currently handles payment-failed and cancellation alerts and restocks tracked items on cancellation. The staged replacement retains both alert cases and adds a `stock_restocked_at` guard. No other branches were present in the inspected live function definition.
- Live table columns confirm `store_order_items.product_id` is text while `products.id` is UUID; the existing inventory function casts the item product ID to UUID. The staged RPC inserts the product UUID as text and uses a UUID cast when restocking.
- Production migration history does not contain the new atomic-order migration. The live database has not been altered by the review-branch SQL.
- The live project currently lists active Edge Functions `create-store-order`, `update-order-status`, `owner-alert-notify`, `owner-invite-team-member`, and `update-product-inventory`. The review-branch source must be compared with deployed function versions before any deployment.

### Current Supabase advisor observations (read-only)

- Security advisor reports `public.owner_report_cron_config` has RLS enabled with no policies. This may be intentional for service-role/cron-only access; verify that no authenticated client needs it and retain deny-by-default access.
- Security advisor flags policies on `admin_alerts`, `categories`, `customer_profiles`, `product_passports`, `products`, `staff_profiles`, `store_order_items`, and `store_orders` because they target the PostgreSQL `authenticated` role, which can also include Supabase anonymous-auth sessions. These warnings do not by themselves prove data exposure: each policy predicate must be checked for ownership, approval and permission constraints. Explicitly reject `auth.jwt()->>'is_anonymous' = 'true'` on sensitive customer/team/order operations where anonymous sessions are not intended.
- Performance advisor reports multiple permissive authenticated policies on several tables (15 findings), increasing policy evaluation work and making effective access harder to audit. Consolidate only after recording the exact intended role/action matrix; do not simply drop team policies.
- Six indexes were reported unused at the advisor snapshot. Do not remove them based on a single low-traffic observation; reassess after real usage.

### Additional release blockers discovered

1. The currently deployed live order-item DELETE trigger plus cancellation restock path can double-credit stock if order lines are deleted after cancellation. The staged migration addresses the path, but needs transaction tests and an explicit order-retention policy.
2. The owner auth UI currently hides the legacy role grid. It implements owner OTP/profile approval and owner-only tools, but does not yet restore Main Admin / Supervisor / Staff / Media / Accounts. Role UI must not be re-enabled until matching server-side permissions are complete.
3. The staged inventory function enforces approved staff profile and `permissions.inventory` update permission, and rejects anonymous users. Verify the deployed version and all direct table grants/RLS policies before enabling team inventory access.
4. Production order creation remains the currently deployed Edge Function version until the review branch is separately tested and deployed. No claim of atomic order creation is made for the live storefront.

No live database writes, Edge Function deployments, branch merges, or Vercel deployments were performed during this follow-up.


## Live Edge Function comparison — 2026-11-01

- Production create-store-order remains deployed at version 12 and still uses separate catalogue/stock reads and order writes. The new atomic RPC and idempotency work is review-branch only; live checkout is not yet protected by it.
- Production update-order-status is version 5 and already supports approved team members with orders.update and dispatch.update permissions, with narrower dispatch transitions. This corrects the earlier source-only note that described it as owner-only.
- Production update-product-inventory is version 2. It checks registered-user status, approved staff profile and inventory.update permission. Its deployed expiry-date regular expression is double-escaped, so ordinary YYYY-MM-DD values fail validation. The review-branch source replaces this with a strict ISO-date helper and canonical UUID validation. This fix is not live.
- Production owner-invite-team-member allows supervisor, staff, media, accounts and star_club roles, but new invitations are unapproved with empty permissions. Invitation is not equivalent to access approval.
- Production owner-alert-notify has JWT verification disabled for scheduled cron calls; scheduled actions are guarded by a stored cron secret and owner actions perform their own user/profile checks. Keep the cron secret private and preserve those checks.

No live Edge Function was changed during this comparison.


## Live grants and team/order access check — 2026-11-01

- The authenticated database role does not have direct UPDATE privilege on store_orders and does not have direct DELETE privilege on store_order_items. This is fail-closed and helps keep customer totals/order lines immutable through the browser. Order status changes must continue through the permission-checking Edge Function.
- Current store_orders UPDATE RLS policy checks orders.update, dispatch.update or accounts.update, but the missing table UPDATE grant means a direct browser update remains denied. The deployed Edge Function uses its service-role client only after checking the approved profile and allowed transition. Do not add a broad authenticated UPDATE grant as a shortcut.
- Order-item SELECT policies are separated for approved owners, customers reading their own orders, and staff with orders/dispatch/accounts read permission. There is no authenticated INSERT/DELETE policy for order lines in the inspected policy set.
- The live stock item trigger function decrements on INSERT and increments on DELETE. The live cancellation alert trigger independently increments stock when an order changes to cancelled. This confirms the duplicate-restock hazard described above.


## Deployed function source tracking

The active production source snapshots for owner-invite-team-member (version 1) and owner-alert-notify (version 11) have now been copied into the review branch under their Supabase function directories. This is source-control recovery only; no Edge Function was redeployed. It reduces the risk of future production changes being made without a matching repository source file.


## Live catalogue/order baseline snapshot — 2026-11-01

Read-only production counts at the time of this check: 1 product total, 0 active products, 1 passport total, 0 published passports, and 0 orders. No product or passport was activated or published and no test order was created. This means QR end-to-end verification and real customer checkout cannot yet be fully exercised against a published sellable item; use isolated test fixtures/staging before production activation.


## Follow-up verification (2026-11-01)

- Read-only production schema inspection confirmed `store_order_items_inventory_delta` is the exact existing trigger name and currently fires AFTER INSERT OR DELETE. Its existing trigger function decrements stock on INSERT and credits stock on DELETE. The proposed migration drops that combined trigger, installs an INSERT-only decrement trigger, and blocks order-line DELETE to prevent a second stock credit after cancellation.
- Confirmed production `store_order_items.created_at` exists, `product_id` is text, and `products.id` is UUID; the new order RPC's item aggregation ordering and ID casts match the current schema.
- Confirmed the production order issue trigger fires only on UPDATE OF `payment_status, order_status`. The new `stock_restocked_at` marker update therefore does not recursively invoke the cancellation trigger.
- Confirmed pgcrypto is installed in the `extensions` schema, matching the migration's SHA-256 call.
- Synced the review-branch `update-order-status` source to the active production version 5. This avoids carrying an older owner-only source file that would otherwise remove the live approved-team `orders.update` / `dispatch.update` permission behavior if deployed.
- JavaScript syntax checks pass for `supabase-checkout.js`, `supabase-admin-passports.js`, and `supabase-admin-products.js`.
- Hardened checkout retry behavior: it now refuses to submit if session storage cannot persist the idempotency key, and deterministic invalid-price responses clear the retry key. The Edge Function now maps invalid product price and malformed order input to actionable client errors.
- QR public page review confirms it reads only `published=true` passports and requires the linked product to remain active; unpublished passports and inactive products are not disclosed through the public QR page.
- Still not production-ready for release: the atomic-order migration has not been executed or tested against an isolated PostgreSQL database; Edge Function/client integration tests, concurrency/rollback/restock tests, durable notification outbox, delivery-fee configuration, and final owner/admin role UI checks remain outstanding. No production schema, data, Edge Function, or Vercel deployment was changed during this verification.


## Final repository and domain topology follow-up — 2026-11-01

- Read-only Vercel project-domain inspection confirms four separate Vercel projects each own a different verified `.vercel.app` hostname: V18 owns `craveislandceylonv18supabaseintegra.vercel.app`; the other projects own `crave-island-ceylon-app.vercel.app`, `crave-island-ceylon-a8zy.vercel.app`, and `crave-island-ceylon-tcpm.vercel.app`. No custom apex domain is attached to any of these four project domain lists. Do not move or reassign domains as part of this repair; the V18 production alias already resolves to the V18 project and its production deployment on `main`.
- Review-branch tree contains 66 entries and no `.github/workflows`, `package.json`, or `vercel.json`. The repository is currently a static HTML/JS site plus Supabase function/migration sources, without a checked-in CI workflow to automatically run SQL/Edge Function integration tests. Add a safe CI pipeline only after defining the project's actual validation/runtime setup; do not invent a build command.
- Review-branch `supabase-admin-auth.js` owner allowlist currently contains `kaushalyadilhani0994@gmail.com` and `kaushalyadhanidissanayake@gmail.com`. The separately stated intended address in the project handover is `kaushalyadilhanidissanayake@gmail.com`; these strings do not match. Production read-only checks previously found the approved owner profile attached to the first address. Do not silently substitute an email or alter the production staff profile: confirm the intended mailbox/account before changing the allowlist/profile mapping. Email allowlisting alone does not grant owner access; the matching authenticated user must also have an approved `staff_profiles` owner row.
- The staged atomic order migration's product/category column names were cross-checked against live information_schema: `products.is_active`, `products.category`, `products.price`, `products.currency`, `products.track_inventory`, `products.stock_quantity`, `products.expiry_date`, and `categories.name/is_active` exist with expected types. The live stock trigger function was also inspected: INSERT decrements inventory and raises `INSUFFICIENT_STOCK` when tracked stock is insufficient; DELETE increments inventory. This supports the staged INSERT-only trigger design, but does not replace isolated rollback/concurrency/restock tests.
- The staged inventory Edge Function's ISO date validator uses a single-escaped digit class and round-trips through UTC ISO date formatting, rejecting impossible dates as well as malformed strings. Its source is not deployed; production version 2 retains the documented date-regex defect.
- These checks were read-only except for the documentation commit on this review branch. No production schema, data, DNS, deployment, or domain assignment was changed.

- Additional live schema compatibility check: all required `store_order_items` insert fields (`order_id`, `product_id`, `product_name`, `quantity`, `unit_price`, `line_total`) are NOT NULL; `sku` is nullable and `id/created_at` have defaults, so the staged RPC's insert column list satisfies current nullability/default requirements. Required `store_orders` fields also match the staged insert, with `updated_at` defaulting to now(). This is schema compatibility evidence only, not an execution test.


## SQL and request-shape hardening follow-up — 2026-11-01

- A final static SQL review caught ambiguous set-returning JSON array aliases in the staged order RPC. The product-row lock query and order-line insert now use explicit `item(value)` / `line(value)` aliases and dereference the JSONB value column, avoiding record-vs-JSONB operator resolution errors.
- The Edge Function now rejects JSON `null`, arrays, and primitive request bodies with HTTP 400 before accessing checkout fields, rather than allowing malformed request shapes to fall into the generic 500 handler.
- These are review-branch-only fixes. No PostgreSQL migration execution, production RPC call, Edge Function deployment, branch merge, or Vercel deployment was performed. Isolated PostgreSQL tests remain mandatory before any release.


## Database-boundary order item validation — 2026-11-01

- Added a second validation layer inside the service-role-only atomic order RPC. Every item must be a JSON object with a canonical UUID product ID and an integer-form quantity before any UUID cast or product-row lock query runs.
- This prevents malformed direct RPC payloads from reaching the row-lock query and surfacing as an unhandled UUID-cast error. The Edge Function retains its own matching input validation.
- Duplicate-line detection now runs only after required item fields have been validated, so missing product IDs cannot be misclassified as duplicate lines.
- Review-branch only; this SQL has not been executed against production or an isolated PostgreSQL test database.


## Order-status endpoint request hardening — 2026-11-01

- Updated the staged `update-order-status` Edge Function to reject anonymous Supabase sessions, malformed JSON shapes (including null, arrays and primitives), and non-canonical UUID order IDs before querying the order table.
- Existing approved staff-profile and per-module `orders.update` / `dispatch.update` checks and status-transition rules are retained.
- This is review-branch source only. The production function remains at its previously inspected deployed version until separately tested and explicitly approved for deployment.


## Owner alert endpoint request-shape hardening — 2026-11-01

- The staged `owner-alert-notify` Edge Function now rejects JSON null, arrays and primitive payloads with HTTP 400 before reading the requested action. Scheduled-secret validation and approved-owner checks remain unchanged.
- This avoids malformed client payloads causing unhandled property-access errors. It does not change Telegram secrets, cron configuration, or production function versions.


## QR, owner navigation and Telegram follow-up — 2026-11-02

- Fixed a confirmed JavaScript regular-expression defect in `supabase-admin-auth.js`: the Admin navigation text matcher used double-escaped whitespace tokens, so it searched for literal backslash-plus-`s` rather than whitespace. This could fail to recognize an existing static Admin navigation item when hiding it for non-owners, and could cause a duplicate Admin entry after owner verification. The matcher now uses normal whitespace regex tokens. This is a review-branch source fix; it has not been deployed.
- Read-only production inspection confirmed the public passport SELECT policy already requires both `published = true` and an active linked product; the applied migration history includes `secure_public_passports_active_product`. A duplicate review migration was briefly staged, then removed once this live policy was confirmed. No production policy change was needed.
- Hardened the scheduled Telegram alert dispatcher with a conditional database claim before sending. Concurrent cron invocations now compete to update the same still-open, unsent, stale-attempt row; only the invocation receiving the claimed row proceeds to Telegram. This reduces duplicate sends from overlapping dispatcher runs. Delivery remains at-least-once: a successful Telegram send followed by a failed database acknowledgement can still be retried after the 15-minute lease window.
- The daily owner report now calculates expiry windows against the Asia/Colombo calendar date and reports a distinct 7-day urgent-expiry count alongside the 30-day count. This is report visibility only; a separate verified 7-day red-dot/in-app alert workflow is still outstanding and must not be represented as completed.
- QR page review: `passport.html` uses text escaping for all database-sourced fields, requires a published passport and active product before rendering, and fails closed when either lookup is unavailable. `shop-qr.html` is a separate shop-promotion QR and does not expose owner tools. Product-specific QR destinations are generated from the product UUID slug and point to the V18 public passport route. QR image generation currently calls the third-party QR Server API; assess local/self-hosted QR generation before launch if avoiding third-party request metadata is a requirement.
- Product management review: product create/update uses the approved-owner RPC `owner_save_product_passport`, generates product/passport/QR data in one transaction, creates products as inactive drafts, and preserves the existing passport publication state on product edits. Passport publishing is a separate owner-only RPC which locks the product row and refuses publication while the product is inactive. The RPC migrations still require isolated PostgreSQL/Supabase execution tests.
- Remaining checks: verify effective column-level grants on `products` so public reads do not disclose operational fields such as stock counts, storage location or internal QR metadata; verify public passport RLS against inactive/missing products; run concurrent dispatcher tests; and implement the actual 7-day red-dot alert UI/record-generation path. No production migration, function deployment, branch merge or Vercel deployment was performed.


## Live Data API column-grant follow-up — 2026-11-02

- Read-only production SQL inspection confirmed `anon` has table-level SELECT on `public.products`, and `authenticated` has table-level SELECT as well. The anonymous column privilege list includes operational fields such as `stock_quantity`, `low_stock_threshold`, `track_inventory`, `expiry_date`, `manufacturing_date`, `storage_location`, and `sku`, in addition to customer-facing catalogue fields.
- The public storefront query in `supabase-store.js` explicitly selects only `id,name,description,category,price,currency,image_url,ingredients,batch_number,qr_code,is_active`; `passport.html` reads only product `name,category`. This means the anonymous role's broad table-level grant is wider than the public UI needs. Restricting anonymous access to only the exact public columns is a safe candidate, but it must be done in a dedicated migration and tested against every public query before deployment.
- Authenticated users also currently hold broad SELECT on `products`. Since Supabase's `authenticated` role includes ordinary signed-in customers as well as staff, RLS row policies alone do not protect internal columns from a customer who can read active product rows. A complete fix needs a public-column view/API plus owner/team-only internal product reads, and corresponding admin UI changes; do not simply revoke authenticated access until those owner/team workflows are migrated.
- Supabase Security Advisor was read-only checked on 2026-11-02. It reports leaked-password protection disabled (Auth setting follow-up), an RLS-enabled `owner_report_cron_config` table with no policies (verify that client roles have no grants and service-role access is intentional), and anonymous-role policy warnings on several tables. Many warnings may be expected because Supabase anonymous sign-ins use the `authenticated` database role; review actual policy predicates and anonymous-user handling rather than blindly removing intended customer access. Advisor also flags cron schema tables; verify effective grants/exposure before changing them.
- No production grants, policies, Auth settings, migrations, Edge Functions, or deployments were changed during these checks.

### Effective cron-schema access check — 2026-11-02

- The Security Advisor reports PUBLIC SELECT on `cron.job` and PUBLIC SELECT/DELETE on `cron.job_run_details`. Read-only privilege checks confirm the grants exist, but `has_schema_privilege('anon','cron','USAGE')` is false, so the anonymous role cannot currently reach those tables through SQL/Data API without schema usage. Treat the advisor item as a hardening warning, not a confirmed anonymous data-exposure path. Do not change cron grants until the project’s exposed-schema configuration and scheduled jobs are checked together.
- `owner_report_cron_config` has RLS enabled and no policies; current table privileges show SELECT/REFERENCES/TRIGGER/TRUNCATE for `service_role` and full table privileges for `postgres`, with no anon/authenticated table grants. This is intentional service-only access; the no-policy advisor finding is not a customer-access issue.
## Public product-column exposure remediation — 2026-11-02

- Confirmed live `public.products` grants expose broad SELECT to `anon` and `authenticated`; the live RLS policy allows active product rows to all authenticated sessions, not just staff. Because ordinary customer accounts use the `authenticated` role, stock counts, expiry/manufacturing dates, storage location, SKU and other operational fields were readable through the Data API. This is a confirmed overexposure, not only an advisor warning.
- Added review migration `202611020002_restrict_public_product_columns.sql`: revoke broad SELECT from PUBLIC/anon/authenticated; grant only storefront columns to anon/authenticated; add `public.owner_list_products()` backed by an approved-owner-only SECURITY DEFINER implementation returning the full product rows. Existing row RLS remains in force for public product reads.
- Updated `supabase-admin-products.js` and `supabase-admin-passports.js` to load internal product details and activation checks through `owner_list_products()` rather than direct table SELECT. Public storefront and passport page continue using only the explicitly granted customer-facing columns.
- Static syntax checks passed for the changed standalone JS files and embedded scripts in the current frontend set. The older `CRAVE_ISLAND_CEYLON_V4_COMPLETE.html` includes ES module imports and was not validated by the simple classic-script parser; it is a legacy standalone file and not the V18 deployed entry point.
- IMPORTANT: this migration is NOT applied to production. Before approval, test PostgREST column-level grants, anon and authenticated storefront queries, owner RPC access, owner activation/deactivation, passport product selection, order creation, and all Edge Functions against an isolated database. Do not deploy the migration until these pass.

## Follow-up review — 2026-11-02

### Team invitation endpoint hardening (review branch only)

A follow-up source review found that `owner-invite-team-member` authenticated a user and checked for an approved owner profile, but did not explicitly reject anonymous Supabase users and parsed the request body without checking its JSON shape or field types. The review branch now:

- rejects anonymous sessions even if a valid JWT is present;
- returns a controlled 400 for invalid JSON and non-object bodies;
- accepts email and display name only as strings;
- bounds email length to 254 characters and display name to 100;
- retains the existing explicit role allowlist (supervisor, staff, media, accounts, star_club);
- does not approve invited profiles or grant permissions automatically.

This is input/authentication hardening only. It does **not** implement the requested role-specific Admin screens or the permission assignment workflow. Invited users remain unapproved with empty permissions until an owner approval process is implemented and tested. The endpoint has not been deployed or runtime-tested.

### Owner email mismatch remains an unresolved release blocker

The source allowlist still contains `kaushalyadilhani0994@gmail.com` and `kaushalyadhanidissanayake@gmail.com`. The project handover notes separately record `kaushalyadilhanidissanayake@gmail.com` as the corrected intended owner email. No address was changed: the exact live approved owner identity must be confirmed against the authenticated account before altering this security boundary. The email allowlist is a UI gate; the approved `staff_profiles` owner row remains the database authority.

### Follow-up verification status

- Static source changes above are committed to `review/atomic-order-idempotency`.
- No production database, Edge Function, Vercel deployment, DNS, secret, or customer data was changed.
- Still required: Deno type/lint check and endpoint tests for malformed JSON, primitive/array bodies, anonymous JWT, non-owner JWT, approved owner, invalid email, overlong fields, invalid role, invite conflict, and profile-write failure.
- Role-based Admin UI, server-side permission assignment/revocation, 7-day expiry red-dot alerts, durable notification outbox, isolated SQL transaction tests, and mobile/browser end-to-end checks remain incomplete.


## Follow-up implementation — owner team/alerts UI and order role alignment (2026-11-03)

### Owner-only Team Access overview

The existing owner dashboard now has a compact **Team Access** card on the review branch. It re-verifies the authenticated user against the approved-owner profile before calling the live `owner_list_team_members()` RPC. It displays team name/email, role, approval state, and assigned permission badges. The panel has a Back-to-Admin action and browser Back handling.

Important safety boundary: this is deliberately read-only. It does not expose invitations, approvals, suspensions, or permission mutation controls because the live `owner_set_team_member_access()` function is SECURITY INVOKER but authenticated lacks UPDATE privilege on `staff_profiles`; no transactional audit table exists. The UI does not attempt a mutation that is known to fail or bypass the safety boundary.

### Owner Alerts panel and red count badge

The existing owner dashboard now has an **Owner Alerts** card, a red open-alert count badge refreshed when the dashboard opens, and an owner-only alert list. It reads `admin_alerts` through the existing authenticated owner RLS policy and displays severity, title, message, alert type and Colombo-local timestamp. Critical alerts have a red marker. It is read-only; it does not acknowledge, resolve, or delete alerts.

Read-only live database inspection confirmed:
- `admin_alerts` SELECT/UPDATE grants exist for authenticated, with RLS policies restricted to `private.is_approved_owner()`; anon has no table grant.
- New-order trigger creates a deduplicated `new_order` alert.
- Order issue trigger creates critical payment-failure and warning cancellation alerts.
- Product inventory trigger creates/refreshes out-of-stock and low-stock alerts.
- Product inventory trigger creates/refreshes expiry alerts when expiry is within 30 days; dates within 7 days and expired dates are marked critical.
- The expiry trigger runs on product INSERT/UPDATE, not merely because the calendar advances. A product that crosses from 8 days remaining to 7 days remaining without a product write will not be re-evaluated by this trigger. A scheduled daily expiry sweep is still required for reliable day-by-day escalation. No new cron job was created.

### Order workspace team-permission alignment

The order workspace was owner-only in the browser even though the deployed `update-order-status` Edge Function and live RLS support approved team members with order/dispatch/accounts read scopes. The review branch now:
- allows approved owner or approved team profiles with `orders.read`, `dispatch.read`, or `accounts.read` to view the order workspace;
- shows all allowed order status transitions only to owner or `orders.update`;
- restricts `dispatch.update` controls to processing → shipped and shipped → delivered;
- keeps `accounts.read` read-only in this workspace;
- rejects anonymous sessions and unapproved profiles.

The server Edge Function remains the authority for each status transition; hiding controls is not relied on as the security boundary.

### Static checks and limits

- JavaScript parse checks passed for `supabase-admin-auth.js`, `supabase-admin-orders.js`, `supabase-admin-products.js`, `supabase-admin-passports.js`, and `supabase-checkout.js` using the JavaScript parser.
- No browser/mobile end-to-end test was run. No staff test accounts exist and no staging Supabase branch is available.
- Team list RPC, owner alert RLS read, order team read/update paths and browser history behaviour still require staging/integration verification.
- No production SQL, Edge Function, secrets, cron jobs, staff records, orders, inventory, Vercel deployment, merge, or DNS settings were changed.


## Follow-up — team permission repair and expiry sweep preparation (2026-11-03)

### Team invite Edge Function

The review branch invitation endpoint now fixes a real validation defect: the email regex was double-escaped, so the intended whitespace/dot checks were not interpreted correctly. It now uses the intended email-shape regex and retains length/role bounds.

If Auth invitation succeeds but the subsequent `staff_profiles` upsert fails, the endpoint now attempts compensating deletion of the invited Auth identity. The response distinguishes successful cleanup from cleanup failure and returns the user ID only when manual recovery is needed. This is not a fully atomic cross-service transaction; the cleanup-failure path remains a recoverable exception requiring owner attention.

Static email-regex samples passed for valid basic/tagged emails and invalid missing-at, duplicate-at, whitespace and missing-local-part values. No real invitation was sent.

### Order workspace least-privilege correction

A follow-up review found that allowing `accounts.read` to open the complete order workspace exposed more customer details (phone, address, notes and line items) than an accounts-only role needs. The review branch now limits the full order workspace to approved owner, `orders.read`, or `dispatch.read`. Accounts-only users do not receive the full order workspace. A dedicated narrow invoices/payments view remains future work.

Status controls now correctly hide/disable when a member has no permitted transitions (empty transition list), rather than relying on array truthiness.

### Daily expiry sweep preparation

Read-only live checks confirmed:
- `products_inventory_alerts_trigger` runs after product INSERT/UPDATE only.
- `refresh_product_inventory_alerts()` opens/reopens expiry alerts inside a 30-day window and marks expiry within 7 days or already expired as critical.
- Existing alert deduplication key is `expiry:<product UUID>`.
- `admin_alerts` has `dedupe_key` uniqueness, RLS owner-only SELECT/UPDATE for authenticated, and service-role INSERT; anonymous has no table grant.
- Existing pg_cron timezone is GMT/UTC. Existing owner daily report job at 14:30 UTC corresponds to 20:00 Sri Lanka.
- A daily sweep at 18:45 UTC (00:15 Asia/Colombo) can refresh expiry severity without requiring product edits.

A review design document was committed at `docs/engineering/team-management-and-expiry-sweep-implementation-draft-2026-11-03.md`. It specifies a private SECURITY DEFINER helper + transactional audit row for team permission changes, preserving the live role/module/action contract and avoiding direct UPDATE grants; it also specifies the daily Colombo-date expiry sweep and cron schedule.

### Migration-history blocker retained

Live Supabase migration history lists five team migrations (20261031025555, 20261031025613, 20261031025621, 20261031025842, 20261031025852) that are not present as SQL files in the GitHub migration directory. The team audit/expiry SQL is therefore not placed in the executable migration folder and was not applied. Exact historical SQL recovery and staging validation remain mandatory.

### Static validation

JavaScript parser checks passed for:
- `supabase-admin-auth.js`
- `supabase-admin-orders.js`
- `supabase-admin-products.js`
- `supabase-admin-passports.js`
- `supabase-checkout.js`

Email regex sample checks passed. Deno runtime/type checks and browser/staging integration tests were not available/performed.

No production SQL, cron jobs, Edge Functions, secrets, invitations, staff profiles, permissions, orders, inventory, Vercel deployment, or DNS settings were changed.
