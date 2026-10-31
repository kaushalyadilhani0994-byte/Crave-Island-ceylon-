# CRAVE ISLAND CEYLON — inventory trigger and transaction design notes

Status: read-only production review, 2026-10-31. Documentation only. No production writes were made.

## Trigger definitions confirmed in production

The following non-internal triggers are attached to the order tables:

- `store_orders_admin_alert_trigger`: AFTER INSERT on `store_orders`, calls `alert_new_store_order()`.
- `store_orders_issue_alert_trigger`: AFTER UPDATE OF `payment_status, order_status` on `store_orders`, calls `alert_order_issues()`.
- `store_order_items_inventory_delta`: AFTER INSERT OR DELETE on `store_order_items`, calls `apply_order_item_inventory_delta()`.
- `store_order_items_runout_forecast_trigger`: AFTER INSERT on `store_order_items`, calls `check_stock_runout_forecast()`.

The four trigger functions are SECURITY DEFINER and pin search_path to `pg_catalog, public`.

## Inventory behaviour confirmed

- On item INSERT, the inventory trigger casts product_id to UUID and atomically decrements tracked stock only when `stock_quantity >= quantity`.
- If the product is tracked but has insufficient stock, it raises `INSUFFICIENT_STOCK`; the item INSERT statement fails.
- On item DELETE, the trigger increments tracked stock by the deleted quantity.
- On transition into cancelled, `alert_order_issues()` increments tracked stock for every item in the order.
- The cancelled transition is guarded by `old.order_status IS DISTINCT FROM 'cancelled'`, preventing repeated restock from repeated cancellation updates.
- The runout forecast trigger calculates recent seven-day sales and creates/resolves a deduplicated low-stock alert.

## Transaction design implication

An atomic order RPC should insert the order row and all item rows inside a single PostgreSQL transaction. This preserves the existing triggers and ensures that any item-trigger exception rolls back the order row, new-order alert, item rows, stock changes and idempotency claim together. It should not manually decrement stock in addition to the existing item trigger, or inventory would be decremented twice.

The RPC must lock product rows in deterministic UUID order before validating stock and prices. The existing conditional stock decrement is an additional guard against overselling. Category active state, product active state, expiry, currency and current price must be validated within the same transaction that creates the order.

## Edge case requiring a deliberate policy

The current schema has two independent stock-return paths:
1. A status transition to cancelled returns all tracked quantities from the order items.
2. Deleting an order item returns its quantity through the DELETE trigger.

If order items are later deleted after an order has been cancelled, stock could be returned twice. No production rows were changed and no destructive test was run. Before adding order deletion, retention, or item-edit functionality, define an explicit stock-ledger/return policy (for example, immutable order lines and a separate idempotent inventory movement ledger). Do not patch this trigger blindly during checkout idempotency work.

## Safe implementation guardrails

- Keep current order lines immutable after order creation unless a separately reviewed inventory adjustment workflow is introduced.
- Never manually decrement stock in the Edge Function and also rely on the database INSERT trigger.
- Never delete order rows/items as a normal cancellation workflow; preserve cancelled orders for audit.
- Use a transaction rollback test in an isolated test project/branch before production migration.
- Ensure order creation, alert creation, item creation, stock effects and idempotency result commit or roll back as one unit.
- Do not change Owner Orders UI, Admin layout, product catalogue, QR, authentication or the production URL as part of this work.

## Evidence boundary

The trigger definitions and function bodies were read from the active Supabase project. The analysis above is based on those definitions. No actual cancellation, item deletion, stock adjustment, order creation, or provider notification was triggered during this review.
