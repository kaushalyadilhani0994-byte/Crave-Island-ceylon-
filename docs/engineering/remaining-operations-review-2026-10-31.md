# CRAVE ISLAND CEYLON — Remaining Operations Review
Prepared: 2026-10-31
Branch: review/atomic-order-idempotency
Planning and source-review document only. Nothing in this document has been applied to production.

## Protected scope
No Admin UI/auth changes, no catalogue edits, no QR changes, no production SQL, no Edge Function deployment, no secret changes, no live order/product creation, and no notification trigger.

## 1. Inventory Edge Function v2 — confirmed date validation defect candidate
The deployed update-product-inventory v2 source contains a date expression written as:
`/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/` in the retrieved source text (two backslash characters before each d in the JavaScript regex literal).
In a JavaScript regex literal, this tests for a literal backslash followed by d, not a digit class. As written, valid dates such as 2026-11-07 are expected to fail this regex.
However, repository-wide code search did not find a frontend invocation of update-product-inventory or a named helper call. Therefore:
- Do not deploy a fix until a real call site is located and its payload contract is confirmed.
- If this function is intentionally unused, leave it alone for now.
- If a future call site is added, use a strict date-only validator that checks exact YYYY-MM-DD format and round-trips the calendar date, with tests for leap day, invalid day/month, null, and malformed strings.
- Do not directly edit product expiry data to test this.

## 2. Customer order receipt — current behavior
The checkout code shows a successful order reference, total, payment method, and a link to My Orders after server confirmation. It does not create or send a PDF/email invoice.
My Orders currently shows order number, created date, order status, item names/quantities/line totals, order total, payment method and payment status. It does not show a complete printable receipt with shipping fee/address breakdown or send an email receipt.
Recommended low-risk next design:
- Build a customer-visible receipt view from the authenticated customer's own order row and its order items only.
- Keep customer_id ownership enforced by RLS and never trust an order ID alone as authorization.
- Use server-stored amounts and product snapshots; do not recalculate from current catalogue prices.
- Escape all displayed text and render a print stylesheet; PDF can be a later enhancement.
- Email delivery should be a separate retryable outbox job; do not block order creation on email provider availability.
- Avoid placing full address/contact details in logs or Telegram.

## 3. Delivery pricing and payment
Verified checkout UI says COD only and delivery fee LKR 0 pending configured rates. Deployed create-store-order v12 rejects non-COD payment methods and sets delivery fee to zero.
The store_orders schema allows cod, bank_transfer, online, but schema allowance does not mean those methods are implemented. Keep checkout COD-only until verified provider/payment workflow exists.
Owner decisions required before public orders:
- Delivery zones/districts and fee table.
- Free-delivery thresholds, if any.
- COD confirmation and failed-delivery process.
Do not guess or silently introduce a fee.

## 4. Order status and feedback automation
update-order-status v5 requires a valid signed-in approved team profile and checks role permissions. Allowed transitions are pending → confirmed/cancelled; confirmed → processing/cancelled; processing → shipped/cancelled; shipped → delivered. Delivered and cancelled are terminal.
It updates order_status with a compare-and-swap condition, preventing stale status writes. It does not currently stamp a delivered_at field in the inspected implementation.
No verified two-day post-delivery feedback workflow was found.
Before implementing feedback:
- Decide whether feedback is optional and customer-consented.
- Prefer a delivered_at timestamp (or immutable status event) rather than guessing from updated_at.
- Schedule an idempotent job for delivered + 48 hours; store a unique feedback-request key per order so retries cannot send duplicates.
- Send only to the verified customer channel and record delivery outcome; provide unsubscribe/opt-out handling.
- Do not send any message until a real test destination is approved.

## 5. Provider notification reliability
Order creation's optional Google Sheets / WhatsApp provider calls are best-effort and do not guarantee delivery when secrets are absent or providers fail.
Recommended design is a transactional outbox written in the same order transaction, then a scheduled worker with bounded retries, dedupe keys, redacted logs, and a visible failed-delivery alert for owner review.
Telegram daily owner report is separate from customer order notification. Oct 31 function response was HTTP 200 with sent:true; function code only returns sent:true after Telegram API HTTP success. This is provider acknowledgement, not independent proof of receipt on the owner's device.

## 6. Schema and safety observations
- store_orders.customer_id references auth.users with ON DELETE SET NULL.
- store_order_items.order_id references store_orders with ON DELETE CASCADE.
- store_order_items has quantity > 0 and nonnegative unit_price/line_total checks.
- store_orders has nonnegative subtotal/delivery_fee/total and LKR-only currency check.
- store_orders payment_method check allows cod/bank_transfer/online; deployed function remains COD-only.
- Current baseline remains 0 orders. Do not create a sample order merely to test constraints.
- Existing stock triggers decrement tracked stock on order-item insert and restore it on item delete. Cancellation status trigger separately restores tracked stock. Deleting order-item rows after cancellation can therefore double-restore inventory; preserve cancelled order lines and define a stock ledger before any line deletion/edit feature.

## 7. Recommended isolated engineering sequence
1. Implement a narrow atomic order RPC with server-side auth/owner-safe grants and idempotency table.
2. Move order + order items + inventory triggers + order alert + notification outbox write into one transaction. Do not manually decrement stock in the Edge Function if the database trigger already does so.
3. Use a stable browser idempotency key per checkout attempt; same key/same payload returns the original order; same key/different payload returns conflict; retain key across network retries and clear after confirmed success.
4. Test sequential retry, concurrent retry, changed payload, forced item-trigger failure, simultaneous last-stock purchase, inactive/expired product, inactive category, RLS/grants, and outbox retries in a separate test project.
5. Add a receipt page using authenticated ownership.
6. Add delivery pricing only after owner decision.
7. Add delivered_at + feedback scheduler only after consent/message policy is decided.
8. Only then request explicit approval for production rollout and rollback plan.

## 8. Explicit non-actions
No SQL has been run to change schema. No deployed function was modified. No product/order rows were written. No staff role or Admin access was changed. No Telegram/WhatsApp/email was sent. Main branch and production deployment remain untouched.
