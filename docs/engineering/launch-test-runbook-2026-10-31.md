# CRAVE ISLAND CEYLON — Controlled Launch Test Runbook
Date prepared: 2026-10-31
Target: first owner-supervised test session
Branch: review/atomic-order-idempotency
Status: planning only — no production code, database, Admin, products, orders, or notifications changed by this document.

## Non-negotiable safety boundary
- Keep the current production URL, Admin layout, owner login/OTP flow, categories, products, QR flows, navigation, and all existing working features unchanged.
- Do not merge this review branch or deploy it to production.
- Do not execute SQL, alter RLS/policies/triggers, deploy Edge Functions, or change secrets as part of the test session.
- Do not create a product, order, payment, or real Telegram/WhatsApp notification until the owner explicitly starts and supervises that test.
- Prefer a separate test project/environment. If none exists, use only one clearly identified owner-approved real product/order and agree on cleanup/retention first. Never delete a cancelled order's item rows: current cancellation and item-delete triggers can each restore tracked stock.

## Verified baseline at preparation time
- Production Vercel alias remains https://craveislandceylonv18supabaseintegra.vercel.app/
- Production deployment inspected: READY, target production, commit e10e3cd0e8c9c2ed2479bac0478983f5ae07d9ba.
- Supabase project is active; current deployed functions observed: create-store-order v12 (JWT required), update-order-status v5 (JWT required), owner-alert-notify v11 (manual cron/owner authorization).
- Latest daily report function response on Oct 31 returned HTTP 200 and sent:true; function code returns sent:true only after Telegram API responds with a successful HTTP status. This is provider acceptance, not independent handset confirmation.
- Current database baseline from latest inspection: 1 product total (0 active, 1 hidden), 60 categories total (14 active), 1 passport (0 published), 0 orders.
- Shop QR page and product passport source were reviewed; physical phone scan/print has not been verified.
- Existing review branch contains design/audit documents only. Main branch was not modified by the audit.

## Known gaps — do not silently change these
1. Order idempotency is not implemented end-to-end: checkout does not send an idempotency key and deployed order function does not deduplicate requests.
2. Order row and order-item rows are written in separate statements with compensating order deletion on item failure, not one atomic transaction.
3. Delivery fee is hard-coded to LKR 0; business delivery rates/terms must be decided by the owner before public sales.
4. Deployed order function currently validates COD only; online payment/bank transfer must not be advertised as active until implemented and tested.
5. Customer order history displays order reference, status, items, total, payment method/status; a full invoice/PDF/email receipt has not been verified.
6. Customer WhatsApp confirmation, reliable provider retry/outbox, and two-day post-delivery feedback automation have not been verified.
7. Telegram daily report has function/provider success evidence, but no independent handset receipt evidence.
8. Supabase Security Advisor warnings remain for review. Do not blindly remove policies: some warnings are due to anonymous sign-ins using the authenticated database role, and cron metadata requires careful role/grant review.
9. Native Supabase leaked-password protection remains disabled; the checkout signup has a client-side strength + Have I Been Pwned k-anonymity check as an interim safeguard. It is not equivalent to server-side native protection.
10. A possible date-regex issue was noticed in the inventory Edge Function, but frontend usage has not been confirmed. Do not patch until call sites and behavior are verified.

## Test sequence for the owner-supervised session

### A. Preserve-and-smoke-check first (no data writes)
- Open the existing production URL on the owner's phone.
- Confirm storefront loads; test All / New / In / Categories / Heritage and existing public sections.
- Confirm dark theme and language/settings screens render without layout regressions.
- Confirm Admin controls are not visible in a signed-out/customer session.
- Confirm public Shop QR page opens and its QR target is the existing storefront root.
- Confirm a known published product passport only if one exists; current baseline says none are published, so do not invent a test passport.
- Record screenshots and exact failures; do not edit the UI during this pass.

### B. Owner Admin access (owner present; no configuration changes)
- Owner opens the existing Admin entry point and completes the current OTP flow.
- Verify the owner sees the existing Admin layout and expected owner tools.
- Navigate between Admin sections and back; verify back-navigation does not unexpectedly jump to storefront.
- Refresh once and confirm the owner session behaves as expected.
- Sign out; verify Admin controls are hidden again.
- Do not add staff invitations or change role permissions in this first pass.

### C. QR checks (no new QR/product creation)
- Open the Shop QR page directly and use a second device to scan the displayed QR.
- Verify it opens the storefront, not Admin.
- If a real published product QR is available later, scan it and verify it opens only that product's public passport page.
- Check printed QR dimensions/quiet zone with a physical print only if the owner chooses to print.

### D. Catalogue and stock checks (read-only first)
- Review active categories and existing product records in Admin.
- Confirm hidden draft remains hidden; do not activate it or edit its details without owner approval.
- Confirm expiry/stock indicators are informational and do not alter quantities during a read-only review.
- Do not create sample stock movements.

### E. Order readiness (do not place an order until the owner explicitly approves)
Before any live order test, agree:
- which actual product is safe to sell/test and its real price, quantity, ingredients/allergens, batch and expiry data;
- delivery fee and delivery-area terms (currently fee is LKR 0 in code);
- COD-only scope (online payments are not active in deployed function);
- whether the order should be a real customer order or be tested in a separate test project.
If approved, use a single small order with the owner present. Verify order number, server-calculated price/total, stock decrement, owner alert, My Orders visibility, and status transitions. Do not retry after an ambiguous timeout until checking whether the first order exists; current idempotency gap can create duplicates.

### F. Notifications (real side effects; separate explicit approval)
- Do not manually trigger daily report or pending-alert dispatcher during ordinary testing.
- First confirm the scheduled daily run at the next scheduled time through logs/provider response.
- If the owner wants an immediate Telegram test, ask first because it sends a real message.
- WhatsApp/Sheets provider delivery needs a separately approved controlled test; no customer data should be sent to an unapproved destination.

## Pass/fail evidence to capture
- Production alias and deployment commit/state.
- Screenshots of public storefront and owner Admin before/after sign-out.
- Owner OTP success/failure and navigation results (never record OTP values).
- Shop QR scan destination; product QR destination if available.
- For any approved order: order number, amount, status, stock before/after, alert result, and My Orders result. Do not record passwords, tokens, full customer address, or payment secrets.
- Telegram provider result and owner's handset receipt separately.

## Go-live decision gates
Do not call the store fully launch-ready until:
- owner Admin and customer/public access separation pass;
- physical Shop QR and any product QR scans pass;
- real product data, ingredients/allergens, batch and expiry are complete;
- delivery fee/areas and COD terms are confirmed;
- order duplicate protection and atomic order+items handling are implemented and tested in an isolated environment;
- customer receipt/confirmation and support workflow are decided;
- security warnings have been triaged with evidence, not suppressed;
- a rollback path and owner approval are documented.

## Implementation work that can safely happen before the test
- Complete static source review and write isolated design/migration proposals for atomic order creation + idempotency.
- Prepare non-destructive test cases and evidence checklist.
- Review the order status transitions, receipt gaps, provider retry design, stock/cancellation semantics, and RLS policy intent.
- Keep all code proposals on this review branch only. No merge, production deployment, or live database change without explicit owner approval.
