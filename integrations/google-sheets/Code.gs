/**
 * CRAVE ISLAND CEYLON — Google Sheets order receiver.
 *
 * Deploy this script as a Web App, execute as the sheet owner, and restrict
 * access according to your Google Workspace/account options. The secret must
 * match Supabase Edge Function secret GOOGLE_SHEETS_WEBHOOK_SECRET.
 */
function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("CIC_WEBHOOK_SECRET");
  const supplied = e && e.parameter ? e.parameter.key : "";
  if (!expected || !supplied || !constantTimeEqual_(expected, supplied)) {
    return json_({ ok: false, error: "unauthorized" });
  }

  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, error: "invalid_json" });
  }
  if (!payload || payload.event !== "order.created" || !payload.order || !payload.order.order_number) {
    return json_({ ok: false, error: "invalid_payload" });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Orders") || ss.insertSheet("Orders");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Received At", "Order Number", "Order Created At", "Customer Name",
        "Email", "Phone", "Delivery Address", "Currency", "Subtotal",
        "Delivery Fee", "Total", "Payment Method", "Payment Status",
        "Order Status", "Customer Note", "Items JSON"
      ]);
      sheet.setFrozenRows(1);
    }

    // Idempotency: a retry must not create duplicate rows for the same order.
    const orderNo = String(payload.order.order_number);
    const last = sheet.getLastRow();
    if (last > 1) {
      const existing = sheet.getRange(2, 2, last - 1, 1).createTextFinder(orderNo).matchEntireCell(true).findNext();
      if (existing) return json_({ ok: true, duplicate: true, order_number: orderNo });
    }

    const o = payload.order;
    const address = o.shipping_address || {};
    const addressText = [address.line1, address.line2, address.city, address.district, address.postal_code, address.country]
      .filter(Boolean).join(", ");
    sheet.appendRow([
      new Date(), orderNo, o.created_at || "", o.customer_name || "", o.email || "",
      o.phone || "", addressText, o.currency || "LKR", Number(o.subtotal || 0),
      Number(o.delivery_fee || 0), Number(o.total || 0), o.payment_method || "",
      o.payment_status || "", o.order_status || "", o.customer_note || "",
      JSON.stringify(Array.isArray(payload.items) ? payload.items : [])
    ]);
    return json_({ ok: true, order_number: orderNo });
  } catch (err) {
    console.error("CIC Sheets webhook error", err);
    return json_({ ok: false, error: "sheet_write_failed" });
  } finally {
    lock.releaseLock();
  }
}

function constantTimeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
