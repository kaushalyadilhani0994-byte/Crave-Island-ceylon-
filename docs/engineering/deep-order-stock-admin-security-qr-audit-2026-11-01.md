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
