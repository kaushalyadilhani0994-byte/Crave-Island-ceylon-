# Atomic order creation and retry safety — implementation review

Status: design only. No production database changes, Edge Function deployment, order, product, or customer data changes were made.

## Scope and guardrails

- Preserve the current production URL, storefront, and Owner Admin layout.
- Keep the current registered-user requirement and COD-only checkout until payment integrations are actually built.
- Do not change the production `main` branch as part of this review.
- Current production order Edge Function remains `create-store-order` v12. This document is not deployed code.

## Verified current behaviour

Repository source `supabase/functions/create-store-order/index.ts` was compared with the deployed v12 source in the prior review and synced on main. The current function:

1. Verifies the bearer token with Supabase Auth and rejects anonymous sessions.
2. Validates delivery fields, COD, unique product IDs, quantities, active products, active categories, price/currency, expiry, and tracked stock.
3. Inserts a `store_orders` row, then inserts `store_order_items` in a separate request.
4. Deletes the order if item insertion fails.
5. Sends Google Sheets and WhatsApp notifications best-effort after persistence.

The checkout client `supabase-checkout.js` currently invokes the function without an `Idempotency-Key` header, despite CORS allowing that header. The Edge Function does not persist or enforce idempotency.

## Database facts checked

- `store_orders` and `store_order_items` both have RLS enabled.
- `store_order_items.order_id` references `store_orders.id ON DELETE CASCADE`.
- An AFTER INSERT trigger on `store_orders` creates an `admin_alerts` row with dedupe key `order:<order UUID>`.
- An AFTER INSERT trigger on `store_order_items` decrements tracked stock and raises an exception if stock is insufficient.
- A second item trigger updates the stock run-out forecast alert.
- The order alert trigger is transactional with the order insert; an atomic RPC failure would roll it back automatically. The current separate-request approach can leave an alert behind if the order insert succeeds, item insert fails, and the cleanup delete removes the order.
- The item insert is a single batch request; PostgreSQL statement/transaction semantics should roll back that statement on trigger failure. The separate order insert still remains until the Edge Function cleanup succeeds.
- No idempotency table or order idempotency unique index currently exists.
- The `private` schema exists and is not in the configured PostgREST exposed schema list. It currently contains the two owner/staff helper functions only.
- `pgcrypto` is installed, though the Edge Function can compute SHA-256 using Web Crypto without requiring database hashing.

## Recommended implementation

### 1. One atomic database transaction

Introduce a narrowly scoped PostgreSQL function that inserts the order and all its line items in one transaction. It must re-check the current product/category state and prices at the point of insertion, not trust the earlier Edge Function read.

Recommended sequence inside the function:

1. Validate arguments and authenticated customer UUID supplied by the Edge Function after `auth.getUser(token)`.
2. Claim/lock the idempotency key (see below).
3. Lock all requested product rows in deterministic UUID order with `FOR UPDATE`, then validate active status, category active status, expiry, currency, price, and available tracked stock.
4. Calculate line totals and order totals from locked database rows.
5. Insert `store_orders`; the existing new-order alert trigger runs in this same transaction.
6. Insert every `store_order_items` row. Existing stock and forecast triggers run in the same transaction.
7. Store the resulting order ID against the idempotency key and return the confirmed order and items.
8. Any error aborts the entire transaction: order, order alert, items, stock decrements, and idempotency claim all roll back together.

The function should be `SECURITY INVOKER` if possible, called only with the server-side service-role client. If a definer function is proven necessary, keep it tightly scoped, fully qualify table names, set a fixed `search_path`, and grant execution only to `service_role`. Do not grant execution to `PUBLIC`, `anon`, or ordinary `authenticated` users. Do not put a privileged function in an exposed schema with default public execute grants.

### 2. Real idempotency

Add a private/internal idempotency table with:

- `customer_id` referencing `auth.users(id)` (cascade on user deletion);
- `idempotency_key` with a strict length/character bound;
- `request_fingerprint` (SHA-256 of a canonical normalized request);
- `order_id` referencing `store_orders(id)`;
- `created_at`;
- unique constraint on `(customer_id, idempotency_key)`.

Use an insert-on-conflict-then-`SELECT ... FOR UPDATE` pattern. Concurrent retries with the same key must wait for the first transaction. If the first succeeds, later requests return the original order without inserting another. If the first transaction fails, its idempotency claim rolls back and a retry can proceed. If the same key is reused with a different fingerprint, return HTTP 409 and require a new checkout attempt.

The server, not the browser, computes the fingerprint from normalized customer/delivery/payment fields and sorted product ID + quantity pairs. Never trust a browser-supplied fingerprint.

### 3. Frontend retry behaviour

- Generate one random idempotency key per checkout attempt.
- Keep that key through network/timeout retries; do not create a new key merely because the response was lost.
- Keep only the opaque key in `sessionStorage`, never customer PII or order details.
- If the basket or checkout payload changes, discard the old key and generate a new one.
- Send `Idempotency-Key` on every attempt.
- Clear the key only after the server confirms the order.
- On an idempotent replay, show the original order confirmation rather than placing another order.

### 4. Notification reliability

Do not rely solely on synchronous best-effort WhatsApp/Sheets calls for guaranteed delivery. A request can commit successfully and then lose its network connection before the notification result is returned.

For reliable retries, add a transactional outbox event in the same order transaction, then let the existing scheduled dispatcher deliver it with retry/backoff and record provider message IDs/status. Keep customer-facing success independent from provider availability. Never send duplicate WhatsApp messages for a repeated checkout key.

## Required verification before production

1. Static review and syntax/type check of the SQL function and Edge Function.
2. Test valid COD order: exactly one order, all expected lines, correct totals.
3. Force an item-trigger failure: verify no order, no order alert, no items, and no stock change remain.
4. Send the same idempotency key twice sequentially: same order ID/order number, one order only.
5. Send the same key concurrently: one order only.
6. Reuse the same key with a changed payload: HTTP 409, no second order.
7. Two simultaneous orders for the last tracked unit: at most one succeeds; stock never goes negative.
8. Expired/inactive product or inactive category: rejected with no partial writes.
9. Verify RLS, function execute grants, private-table exposure, and Supabase Security Advisors.
10. Verify notification outbox delivery and retry separately from order persistence.

## Other checkout gaps (not silently included in this change)

- Online payment and bank transfer are not currently available in the checkout UI; backend currently accepts COD only.
- Delivery fee is currently hard-coded to LKR 0 and is visibly disclosed in checkout. Real delivery rates must be configured before launch.
- A customer PDF/email receipt was not verified.
- Two-day post-delivery feedback automation was not verified.
- Google Sheets and WhatsApp provider delivery has not been end-to-end confirmed.

## Supabase platform note

Supabase announced on 28 April 2026 that newly created tables are no longer automatically exposed to the Data API by default, with enforcement on existing projects from 30 October 2026. Keep internal idempotency/outbox tables in the non-exposed `private` schema and do not expose them just to support the checkout RPC. Any future public table must be deliberately exposed and protected with RLS.

## Decision

Proceed with the atomic transaction + idempotency + outbox as a reviewed, isolated implementation. Do not apply SQL to production or deploy a replacement Edge Function until the full schema, grants, rollback behaviour, and test cases above are reviewed.
