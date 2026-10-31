# CRAVE ISLAND CEYLON — Checkout, customer order history and delivery audit

Reviewed against GitHub `main` frontend/function source and read-only production schema metadata on 2026-10-31. This is documentation only. No production code, database rows, policies, functions, orders, products, categories, or deployment were changed.

## Confirmed customer checkout behaviour

- `supabase-checkout.js` requires a signed-in Supabase user before checkout submission.
- The browser submits product IDs and quantities; `create-store-order` v12 re-reads active products and recalculates LKR prices server-side.
- The form collects customer name, phone, city, district and delivery address.
- Payment selector currently exposes Cash on Delivery only. Backend rejects other payment methods.
- Checkout explicitly tells the customer that delivery fee is currently LKR 0 until rates are configured, and asks them to confirm delivery charges before public launch.
- The function sets delivery fee to zero. This is not a configurable delivery tariff and should remain unchanged until the owner defines delivery zones/rates.
- Cart clearing occurs only after the function returns a confirmed order. On an error, the cart is retained.
- A successful checkout shows order number, total, payment method/status and a link to My Orders.
- The client does not send an `Idempotency-Key` header. The Edge Function allows that header in CORS but does not persist or enforce it.

## Customer order history and receipt gap

- `my-orders.html` signs in with email/password, then selects orders filtered by the authenticated customer's own `customer_id`; item rows are fetched only for those order IDs.
- It displays order reference, created time, status, line items, total, payment method and payment status.
- It does not currently display a full invoice/receipt, delivery address, delivery fee breakdown, downloadable PDF, or email receipt.
- No customer receipt email or receipt-generation endpoint was verified in the reviewed repository paths.
- Avoid storing customer names, phone numbers, addresses or order-line PII in browser localStorage. The checkout source explicitly avoids doing so.

## Delivery timestamp and 48-hour feedback gap

- The production `store_orders` schema currently has `created_at` and `updated_at`, but no dedicated `delivered_at` column.
- The approved-owner order UI permits the status transition to `delivered` through `update-order-status` v5.
- That function updates `order_status` only; it does not record a dedicated delivery timestamp or create a feedback invitation.
- A two-day-after-delivery message cannot be scheduled reliably from `updated_at`, because other order updates can change that timestamp.
- No verified feedback preference/opt-out field or 48-hour feedback scheduler was found in the reviewed repository paths.
- A safe implementation needs a delivery timestamp set exactly on the transition to delivered, a unique per-order feedback invitation record, opt-out/consent handling, and a scheduled idempotent dispatcher. It must not send to customers until an owner-approved test.

## Notification integration findings

- The current `create-store-order` source treats Google Sheets and WhatsApp as optional best-effort owner notifications. It awaits configured provider calls, checks HTTP/provider response success, and logs failures; an order can still succeed when a provider is missing or unavailable.
- The Google Sheets receiver uses a script property secret, a script lock and order-number duplicate detection before appending a row. The sheet contains customer contact and delivery details and must remain private.
- The WhatsApp integration is an owner/admin template alert; it is not a customer WhatsApp confirmation.
- Repository setup notes describe the integration configuration, but repository code alone does not prove that the production secrets are present or that a provider has delivered a real order notification. Do not trigger a live order merely to test.
- The daily owner Telegram report is a separate integration. The 2026-10-31 scheduled function response was `sent:true`; in the function implementation this is returned only after Telegram's API responds successfully. This confirms API acceptance, not independent handset receipt.

## Existing order status safety

- `update-order-status` requires a valid user token and an approved owner profile.
- It validates allowed status transitions and uses a compare-and-swap update against the prior status to reject stale concurrent changes.
- Preserve this behaviour. Do not broaden permissions or change the Owner Orders interface as part of checkout hardening.

## Safe work sequence — review branch only

1. Implement atomic order + item creation and server-enforced idempotency together, with product row locking and transactional inventory effects.
2. Add a dedicated delivered timestamp with a narrowly scoped, tested status-transition path.
3. Design customer receipt output from the database's authoritative order snapshot; avoid browser-local PII persistence.
4. Design a durable notification outbox for Sheets/WhatsApp/customer receipt with retries and deduplication.
5. Implement the 48-hour feedback workflow only after delivery timestamp, consent/opt-out and unique invitation semantics are defined.
6. Ask the owner to set delivery pricing and decide supported payment methods; do not assume rates or payment provider details.
7. Test all changes on isolated test records and a dedicated test account, then obtain explicit owner approval before any production migration, function deployment, merge or customer notification.

## Explicit non-changes

No production changes were made. Existing Admin layout, products, categories, QR flows, login, navigation, database rows, Edge Functions, project settings and production URL remain untouched. No test order, customer message, provider call, migration, merge or deployment was performed.
