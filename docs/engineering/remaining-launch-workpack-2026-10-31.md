# CRAVE ISLAND CEYLON — Remaining Launch Workpack
**Review date:** 2026-10-31  
**Target:** close the highest-risk launch gaps without changing the existing storefront or Admin.

> This is an isolated engineering workpack on `review/atomic-order-idempotency`. It is not deployed. No production data, Admin/auth code, database schema, customer records, products, orders, or notifications were changed.

## 1. Non-negotiable preservation boundary

- Keep the current V18 storefront, existing navigation, theme, product/category data, QR behaviour, Admin layout, OTP flow, owner visibility checks, and production URL unchanged.
- Do not refactor or restyle `supabase-admin-auth.js`, `admin.html`, or the existing owner dashboard as part of launch-gap work.
- Do not delete, rename, deactivate, or overwrite existing catalogue records.
- All new code and migrations must be reviewed on this branch, tested against an isolated Supabase project/test account, and explicitly approved before merge/deploy.
- Never create fake customer orders, send real customer/Telegram/WhatsApp/email messages, or publish test passports in production.

## 2. Verified current position

### Customer catalogue and QR
- Storefront reads only active products and active categories from Supabase. A successful empty catalogue response intentionally does not fall back to demo products.
- Current live database snapshot from the latest audit: 60 categories total, 14 active; 1 product total, 0 active; 1 passport total, 0 published; 0 orders.
- Shop promotion QR is a separate route from per-product passport QR. The shop QR resolves to the storefront root. Product passport pages are public read-only and require a published passport plus active product.
- Physical print/scan and real-device navigation have not been completed.

### Checkout and customer orders
- Checkout requires a registered, signed-in customer. Server validates customer JWT, product/category activity, current server-side prices, quantities, expiry and tracked stock.
- Current deployed order endpoint supports COD only. Delivery fee is hard-coded to LKR 0 and checkout copy tells customers to confirm delivery charges before launch.
- Order header and order lines are currently written in separate operations; cleanup is attempted if item insertion fails. The idempotency header is accepted by CORS but no durable deduplication is enforced in the audited implementation.
- My Orders is scoped to the signed-in customer's own user ID and shows order reference/date/status/items/total/payment method/status. It does not yet provide a full invoice, downloadable receipt, or verified email receipt.
- No successful end-to-end order has been run with a real active product and a controlled customer account.

### Order operations and alerts
- Owner order status updates are routed through a JWT-protected Edge Function with approved-staff checks and allowed status transitions.
- Current inspected transition path: pending → confirmed/cancelled; confirmed → processing/cancelled; processing → shipped/cancelled; shipped → delivered. Delivered and cancelled are terminal.
- The inspected status updater does not stamp a delivered timestamp. No verified 48-hour feedback automation exists.
- Daily owner report is scheduled for 20:00 Sri Lanka time. Latest cron execution returned HTTP 200 and `sent:true`; source inspection showed this response follows a successful Telegram API response. This proves provider acknowledgement, not handset receipt.
- Pending-alert dispatcher has returned successful empty-queue results. No test alerts were inserted.

### Product management
- Owner product flow saves new products hidden/inactive first; QR/passport publication is a separate step and requires an active product.
- Product save and passport/QR attachment are multiple writes rather than one transaction; partial hidden draft can remain if later step fails.
- Category editing and product image upload workflow remain incomplete/unverified. The owner product tools require a real owner-session browser test.
- The existing single draft product remains untouched.

## 3. Priority plan — execute in this order

### P0 — protect order integrity (must precede real public orders)
1. Implement server-enforced idempotency: one stable client-generated opaque key per checkout attempt; persist it with customer ID and a canonical request fingerprint. Same customer + same key + same payload returns the original order; same key + different payload returns HTTP 409. Concurrent retries must converge on one order.
2. Replace the split header/line write with one narrow Postgres transaction/RPC. Re-check product/category activity, price, expiry and stock inside the transaction; lock product rows in deterministic UUID order; insert header and all item snapshots together.
3. Preserve existing inventory triggers as the single stock decrement mechanism. Do not add a second decrement in the Edge Function/RPC. Transaction rollback must roll back order, lines, inventory changes and trigger-created alerts together.
4. Keep COD-only until a real payment provider is configured and verified. Do not enable bank transfer or online payment merely because the table constraint allows those values.
5. Add a durable notification outbox only after schema and privacy design are reviewed. Provider retries must not create another order.

**Required isolated tests:** valid order; same-key sequential retry; same-key concurrent retry; same key with changed payload; forced item/trigger failure rolls back everything; two buyers competing for last stock; inactive category/product; expired product; insufficient stock; RLS/grant checks; outbox retry and dedupe.

### P1 — make order fulfilment and customer communication complete
1. Define delivery pricing and service areas with the owner before changing the current zero-fee behaviour. Record the chosen policy and show the same server-calculated fee in checkout, confirmation, My Orders and receipt.
2. Create a receipt view from immutable order and item snapshots: order number, date, customer/delivery details, item names/quantities/unit prices/line totals, subtotal, delivery fee, total, currency, payment method/status, store support contact and clear receipt identifier.
3. Customer receipt access must remain owner/customer scoped. Prefer a server-authorized receipt endpoint or RLS-protected order read; never expose service-role credentials or public unrestricted invoice URLs. PDF generation can be client-side from authorized data, but the server remains source of truth.
4. Add `delivered_at` semantics only after confirming the exact current schema and migration history. Set it once on the valid transition into delivered; do not let later edits reset it.
5. Schedule one feedback invitation per delivered order at or after 48 hours. Use a unique dedupe key per order, respect customer opt-out/consent and valid contact channel, and keep delivery attempts in an auditable queue. Do not send messages until the owner approves copy, sender, and consent wording.
6. Add cancellation/refund/return policy and customer support contact details before public checkout.

**Required tests:** receipt cannot be accessed by another customer; receipt totals match stored snapshots; delivery fee is identical in all views; delivered timestamp is stable; feedback not sent before 48 hours; exactly one invitation after retries; opt-out prevents sending.

### P2 — finish product publishing and operational readiness
1. Verify product editor required fields and validation against real food-label needs: product name, category, price, ingredients, allergens, net weight/pack size, batch/lot, manufacture/best-before dates, storage instructions, product description and product image.
2. Add category editing and secure image upload only after reviewing current Storage buckets, object policies, file size/type limits and public/private delivery requirements. Use generated random object names; validate MIME type and size; never accept arbitrary HTML/script content as an image.
3. Keep product creation as draft → owner review → activate → passport publish → QR label. Make partial failures visible and safely resumable; never silently activate a product if passport data is incomplete.
4. Ensure product QR contains only the public passport URL and never an Admin URL/token. Shop promotion QR continues to point to the storefront.
5. Create an owner-only pre-publication checklist for label facts, ingredients/allergens, date format, stock threshold, image rights, and QR scan.
6. Do not bulk activate categories or publish the existing draft product. The owner must confirm each product's factual details.

### P3 — role, alerts, and security verification
1. Preserve current owner Admin and OTP UI exactly. Review staff-role permission enforcement as a separate read-only exercise; never rely on hidden buttons as security.
2. Confirm every staff action is checked server-side against an approved staff profile and module/action permission. Customer-facing routes must never load owner tools or secrets.
3. Keep alert categories actionable and deduplicated: new order, failed/cancelled order, low stock, expiry approaching, product/passport publishing failure, staff access denied, and integration delivery failure.
4. Alert thresholds and expiry lead time must be owner-configurable or explicitly documented; do not invent values. Red-dot counts must derive from open alerts and must not expose sensitive details to customers.
5. Re-review RLS policies and grants against actual predicates. Do not delete duplicate/permissive policies blindly. Leaked-password protection remains a Supabase dashboard plan-dependent control; frontend breached-password screening is only an additional layer, not equivalent.
6. Verify cron secret access is service-only and never print or commit secret values. Telegram `sent:true` is provider acknowledgement, not proof the owner handset displayed the message.

## 4. Release sequence and stop/go gates

| Gate | Must be true before proceeding |
|---|---|
| A — Preservation | Existing production URL, storefront, Admin, OTP, catalogue and QR unchanged; review branch isolated |
| B — Order safety | Atomic transaction, idempotency, stock concurrency and RLS tests all pass in isolated environment |
| C — Customer experience | Delivery fee/policy confirmed; receipt access and totals verified; support/cancellation policy published |
| D — Fulfilment | Delivered timestamp, feedback timing, opt-out and notification dedupe tests pass |
| E — Product operations | Owner can safely draft/edit/activate a real product; passport/QR publication and scan verified |
| F — Launch | Owner OTP/Admin, customer sign-up, mobile checkout, order status, owner alerts, physical QR, privacy and cross-account isolation pass on real devices |

A Vercel deployment marked READY is only a build/deployment status; it is not proof of browser, payment, QR, or customer journey correctness.

## 5. Owner decisions required before implementation (do not guess)
- Delivery zones, rates, free-delivery threshold (if any), and whether charges vary by weight/district.
- COD coverage and collection rules; whether bank transfer or online payment is wanted later.
- Official customer support phone/email and cancellation/return/refund policy.
- Which customer contact channel is approved for receipts and 48-hour feedback; consent/opt-out wording.
- Receipt language and brand details (Sinhala/English, business address/registration details if applicable).
- Food label facts for each real product; never invent ingredients, allergens, nutrition, weights, dates or shelf-life.

## 6. Work deliberately not done
- No Admin/auth/layout changes.
- No production SQL/migration or Edge Function deployment.
- No merge, pull request, production deployment or URL change.
- No product/category/order/passport records created, edited, activated or deleted.
- No real email, Telegram, WhatsApp, SMS or customer notification sent.
- No live checkout, QR handset scan, or physical label test claimed.

## 7. Completion accounting
The audit/design work is substantially mapped, but the application is **not 75% launch-ready**: critical transaction/idempotency, real product catalogue, delivery pricing, receipt, feedback and real-device acceptance tests remain open. The safe next engineering milestone is P0 order integrity in an isolated test project, followed by P1 receipt/fulfilment. Production remains frozen until explicit approval.
