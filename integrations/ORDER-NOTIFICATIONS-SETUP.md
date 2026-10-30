# Order notifications setup — CRAVE ISLAND CEYLON

The secure checkout can optionally notify Google Sheets and the store owner through the WhatsApp Business Platform after an order and its items have been saved.

**Important:** these integrations stay inactive until their secrets are configured. A missing or failed notification must never cancel a saved order. The customer checkout currently supports Cash on Delivery only. Customer WhatsApp messages are not sent by this integration; the WhatsApp template is for the store owner/admin.

## Google Sheets

1. Create a Google Sheet for store orders.
2. Open **Extensions → Apps Script** and copy the contents of `integrations/google-sheets/Code.gs` into the script editor.
3. In Apps Script, open **Project Settings → Script Properties** and add:
   - Property: `CIC_WEBHOOK_SECRET`
   - Value: a long random secret you generate and keep private.
4. Deploy as a **Web app**, execute as the sheet owner, and use the access setting appropriate for your account. Copy the deployed Web App URL.
5. Configure these secrets for the Supabase project (never put them in browser code):
   - `GOOGLE_SHEETS_WEBHOOK_URL` = deployed Apps Script Web App URL
   - `GOOGLE_SHEETS_WEBHOOK_SECRET` = exactly the same secret as `CIC_WEBHOOK_SECRET`
6. Test using a non-customer test order and verify a single row appears in the `Orders` tab. Duplicate webhook retries are de-duplicated by order number.

Each row includes the order number, timestamp, customer contact/delivery details, totals, payment/order status, note, and item snapshot. Keep the sheet private because it contains customer personal information.

## WhatsApp Business Platform — owner order alert

Requires a Meta WhatsApp Business Platform setup, a registered sender/phone-number ID, a valid access token, and an approved message template. A personal WhatsApp click-to-chat link is not sufficient for server-side automated messages.

Configure these Supabase Edge Function secrets:
- `WHATSAPP_ACCESS_TOKEN` = Meta Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` = sender phone-number ID from Meta
- `WHATSAPP_ADMIN_NUMBER` = owner/admin recipient number in international digits format (digits only is recommended)
- `WHATSAPP_ORDER_TEMPLATE` = exact name of an approved WhatsApp message template
- `WHATSAPP_TEMPLATE_LANGUAGE` = template language code (defaults to `en`)

The approved template must have four body placeholders, in this order:
1. Order number
2. Customer name
3. Customer phone
4. Order total (LKR)

A template with a different number/order of placeholders will fail; test the template in Meta before enabling production notifications. Keep tokens secret and rotate them if exposed.

## Safety and current state

- The V18 `create-store-order` Edge Function (deployed version 12 at the latest audit) contains optional Google Sheets and WhatsApp-owner notification hooks. Each hook runs only when all of its required Edge Function secrets are present.
- A successful order save does not prove a notification was delivered. The function checks provider responses and logs failures; the customer order is retained if a notification provider is unavailable.
- The checkout currently supports Cash on Delivery only. The server rejects other payment methods, and delivery fee is fixed at LKR 0 until verified delivery rates are configured.
- No Google Sheet URL, webhook secret, Meta token, sender ID, admin number, or approved template is committed in this repository.
- The Google Sheets webhook uses a shared secret in the request query string because Apps Script web-app event objects do not expose arbitrary request headers. Keep that secret private, rotate it if exposed, and restrict the destination sheet to authorized staff.
- Customer WhatsApp confirmations, customer opt-in records, automatic customer email receipts, 48-hour feedback follow-ups, delivery pricing, and online card payments are not implemented or verified. Do not advertise these as active features.
- Before enabling either integration, configure its secrets in Supabase Edge Function secrets, place a controlled test order, and confirm the provider-side delivery (a 200 response from the Edge Function alone is not proof of delivery).
