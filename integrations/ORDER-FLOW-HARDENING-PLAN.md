# CRAVE ISLAND CEYLON — Order Flow Hardening Plan

Reviewed against the currently deployed Supabase Edge Function source on 2026-10-31. This is an implementation plan; no customer orders or live order records were created or changed.

## Confirmed current behaviour
- create-store-order v12 requires a valid registered Supabase user and rejects anonymous sessions.
- The server recalculates prices from active products; the client does not control the final total.
- It accepts COD only, validates active categories, rejects expired products, validates quantities and checks tracked stock.
- It inserts the order, then inserts order items; if item insertion fails it attempts to delete the newly inserted order.
- Optional Google Sheets and WhatsApp notifications are attempted after order creation. Their delivery is not proven until provider credentials and a real controlled test are completed.
- The checkout client clears the cart only after a successful server response.
- No current orders exist; no test order was created during this review.

## Risks requiring correction before public order launch
1. Duplicate submissions: the function accepts an Idempotency-Key header but the inspected flow does not persist or enforce it. A retry after a timeout could create a second order.
2. Stock race: stock is read and checked before order insertion. Two simultaneous checkouts can both pass the same stock check. Reservation/decrement must be atomic inside the database transaction.
3. Order + items atomicity: separate inserts and compensating delete are not as strong as one database transaction/RPC. A single transactional database function should create the order and its items together.
4. Notifications: external provider failures are logged, but an order can still be created without confirmed WhatsApp/Sheets delivery. Add a durable outbox/retry record so notification failures are visible to the owner and safely retried.
5. Customer receipt: the current checkout response shows order confirmation/reference, but a complete customer receipt delivery path has not been verified.
6. Post-delivery feedback: no verified two-day-after-delivery feedback automation was found in the repository search. It needs a scheduled, idempotent job based on delivered timestamp and customer consent/preferences.

## Safe implementation sequence
- Inspect exact live table constraints, indexes, status values, inventory triggers, and order function source before writing migrations.
- Add a unique (customer_id, idempotency_key) request record or equivalent constraint and return the original order for a repeated request.
- Implement a narrowly scoped SECURITY DEFINER RPC with fixed search_path, strict input validation, and explicit grants. It must lock relevant product rows (FOR UPDATE), re-check active category, expiry and stock, create the order and lines in one transaction, and reserve/decrement stock atomically.
- Preserve the current server-side price calculation and COD-only behaviour until payment integration is verified.
- Add an outbox table with restricted RLS and a service-role-only dispatcher for WhatsApp/Sheets/receipt events; retries must be idempotent and must not create another order.
- Add a feedback scheduler that selects only delivered orders whose delivered timestamp is at least 48 hours old, records one feedback invitation per order, and respects opt-out settings.
- Test on isolated test records and a dedicated test customer account before any production migration or customer notification.

## Release gate
Do not deploy invasive order changes or run live customer notifications until transaction tests, duplicate-submit tests, stock concurrency tests, owner alert delivery, customer receipt delivery, and 48-hour feedback tests pass. Never fabricate a customer order for testing.
