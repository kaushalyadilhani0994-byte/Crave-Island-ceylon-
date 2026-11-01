import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanText(value: unknown, max = 180): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "Use POST to create an order." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!supabaseUrl || !serviceKey || !token) {
    return respond(401, { error: "Please sign in before placing an order." });
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return respond(401, { error: "Your session is invalid or expired. Please sign in again." });
    const user = authData.user;
    // Anonymous Supabase sessions are not eligible to place store orders.
    if (user.is_anonymous) return respond(401, { error: "Please sign in with a registered account before placing an order." });

    let parsedBody: unknown;
    try { parsedBody = await req.json(); } catch { return respond(400, { error: "Invalid JSON request." }); }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return respond(400, { error: "Order request must be a JSON object." });
    }
    const body = parsedBody as Record<string, unknown>;

    const customerName = cleanText(body.customer_name, 120);
    const phone = cleanText(body.phone, 40);
    const note = cleanText(body.customer_note, 500);
    const address = body.shipping_address && typeof body.shipping_address === "object" && !Array.isArray(body.shipping_address)
      ? body.shipping_address as Record<string, unknown> : null;
    const addressLine = cleanText(address?.line1, 180);
    const city = cleanText(address?.city, 100);
    const district = cleanText(address?.district, 100);
    if (!customerName || !phone || !addressLine || !city || !district) {
      return respond(400, { error: "Name, phone, address, city and district are required." });
    }

    const paymentMethod = cleanText(body.payment_method, 30);
    if (paymentMethod !== "cod") {
      return respond(400, { error: "This payment method is not available yet. Choose cash on delivery." });
    }

    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
      return respond(400, { error: "An order must contain between 1 and 50 different products." });
    }
    const items = body.items.map((item: unknown) => {
      const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { product_id: cleanText(value.product_id, 64).toLowerCase(), quantity: Number(value.quantity) };
    });
    if (items.some((item) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
      return respond(400, { error: "One or more product IDs or quantities are invalid." });
    }
    if (new Set(items.map((item) => item.product_id)).size !== items.length) {
      return respond(400, { error: "Please combine duplicate products into one cart line." });
    }

    // Atomic RPC: order header, order lines, stock reservation and retry record commit together.
    const rawKey = req.headers.get("idempotency-key") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawKey)) {
      return respond(400, { error: "A valid checkout retry key is required. Refresh checkout and try again." });
    }
    const normalizedAddress = { line1: addressLine, line2: cleanText(address?.line2, 180), city, district, postal_code: cleanText(address?.postal_code, 20), country: "Sri Lanka" };
    const atomicPayload = { customer_name: customerName, email: user.email || null, phone, shipping_address: normalizedAddress, payment_method: paymentMethod, customer_note: note || null, items };
    const { data: result, error: atomicError } = await admin.rpc("create_store_order_atomic", { p_customer_id: user.id, p_idempotency_key: rawKey, p_payload: atomicPayload });
    if (atomicError || !result || !result.order) {
      const detail = String(atomicError?.message || "");
      console.error("Atomic order creation failed", detail);
      if (detail.includes("INSUFFICIENT_STOCK")) return respond(409, { error: "Stock changed while placing your order. Please review your basket and try again." });
      if (detail.includes("PRODUCT_EXPIRED") || detail.includes("PRODUCT_UNAVAILABLE")) return respond(409, { error: "A product or collection is no longer available. Refresh the catalogue and try again." });
      if (detail.includes("IDEMPOTENCY_KEY_REUSED")) return respond(409, { error: "This checkout retry key belongs to a different basket. Refresh checkout and try again." });
      if (detail.includes("INVALID_PRODUCT_PRICE")) return respond(409, { error: "A product price or currency needs to be corrected before this order can be placed. Please refresh the catalogue." });
      if (detail.includes("Required customer") || detail.includes("Only cash on delivery") || detail.includes("Invalid product") || detail.includes("Order must contain") || detail.includes("Order total")) return respond(400, { error: "Some checkout details or basket items are invalid. Please review them and try again." });
      return respond(500, { error: "We could not safely save your order. Please try again." });
    }
    const order = result.order as Record<string, unknown>;
    const orderItems = Array.isArray(result.items) ? result.items as Array<Record<string, unknown>> : [];
    const subtotal = Number(order.subtotal || 0);
    const deliveryFee = Number(order.delivery_fee || 0);
    const customerAddress = normalizedAddress;

    // Optional external notifications. Order creation must succeed even if an external provider is not configured or is temporarily unavailable.
    const notificationPayload = {
      event: "order.created",
      order: {
        order_number: order.order_number,
        created_at: order.created_at,
        customer_name: customerName,
        email: user.email || null,
        phone,
        shipping_address: customerAddress,
        currency: "LKR",
        subtotal,
        delivery_fee: deliveryFee,
        total: Number(order.total || 0),
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        order_status: order.order_status,
        customer_note: note || null,
      },
      items: orderItems,
    };

    const notificationTasks: Promise<void>[] = [];
    const sheetsUrl = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") || "";
    const sheetsSecret = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET") || "";
    if (!result.replayed && sheetsUrl && sheetsSecret) {
      notificationTasks.push((async () => {
        try {
          const target = new URL(sheetsUrl);
          target.searchParams.set("key", sheetsSecret);
          const response = await fetch(target.toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(notificationPayload),
            signal: AbortSignal.timeout(5000),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok || !result || result.ok !== true) {
            console.error("Google Sheets order sync was not confirmed", response.status, result?.error || "invalid_response");
          }
        } catch (e) {
          console.error("Google Sheets order sync failed", e instanceof Error ? e.message : "unknown error");
        }
      })());
    }

    const waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    const waAdmin = Deno.env.get("WHATSAPP_ADMIN_NUMBER") || "";
    const waTemplate = Deno.env.get("WHATSAPP_ORDER_TEMPLATE") || "";
    const waLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "en";
    if (!result.replayed && waToken && waPhoneId && waAdmin && waTemplate) {
      notificationTasks.push((async () => {
        try {
          const response = await fetch("https://graph.facebook.com/v21.0/" + encodeURIComponent(waPhoneId) + "/messages", {
            method: "POST",
            headers: { "Authorization": "Bearer " + waToken, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: waAdmin.replace(/[^0-9]/g, ""),
              type: "template",
              template: {
                name: waTemplate,
                language: { code: waLanguage },
                components: [{ type: "body", parameters: [
                  { type: "text", text: String(order.order_number) },
                  { type: "text", text: customerName },
                  { type: "text", text: phone },
                  { type: "text", text: "LKR " + (subtotal + deliveryFee).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
                ] }],
              },
            }),
            signal: AbortSignal.timeout(5000),
          });
          const result = await response.json().catch(() => null);
          if (!response.ok || !result || !Array.isArray(result.messages) || result.messages.length === 0) {
            console.error("WhatsApp owner notification was not confirmed", response.status, result?.error?.message || result?.error?.code || "invalid_response");
          }
        } catch (e) {
          console.error("WhatsApp owner notification failed", e instanceof Error ? e.message : "unknown error");
        }
      })());
    }

    // These integrations are deliberately best-effort; never lose a saved order because a notification provider is down.
    await Promise.all(notificationTasks);

    return respond(result.replayed ? 200 : 201, { order, items: orderItems, replayed: Boolean(result.replayed), notifications: {
      google_sheets_configured: Boolean(sheetsUrl && sheetsSecret),
      whatsapp_owner_configured: Boolean(waToken && waPhoneId && waAdmin && waTemplate),
    } });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PRICE") {
      return respond(400, { error: "A product has an invalid price or currency." });
    }
    console.error("Unexpected order creation error", error);
    return respond(500, { error: "Something went wrong while placing your order." });
  }
});