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

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return respond(400, { error: "Invalid JSON request." }); }

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
      return { product_id: cleanText(value.product_id, 64), quantity: Number(value.quantity) };
    });
    if (items.some((item) => !/^[0-9a-f-]{36}$/i.test(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50)) {
      return respond(400, { error: "One or more product IDs or quantities are invalid." });
    }
    if (new Set(items.map((item) => item.product_id)).size !== items.length) {
      return respond(400, { error: "Please combine duplicate products into one cart line." });
    }

    const productIds = items.map((item) => item.product_id);
    const { data: products, error: productsError } = await admin
      .from("products")
      .select("id,name,price,is_active,currency")
      .in("id", productIds)
      .eq("is_active", true);
    if (productsError) {
      console.error("Product validation failed", productsError.message);
      return respond(500, { error: "We could not verify the catalogue. Please try again." });
    }
    if (!products || products.length !== productIds.length) {
      return respond(400, { error: "A product in your basket is no longer available. Refresh the catalogue and try again." });
    }

    const productById = new Map(products.map((product) => [String(product.id), product]));
    const orderItems = items.map((item) => {
      const product = productById.get(item.product_id)!;
      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0 || product.currency !== "LKR") throw new Error("INVALID_PRICE");
      return {
        product_id: String(product.id),
        product_name: product.name,
        quantity: item.quantity,
        unit_price: price,
        line_total: Math.round(price * item.quantity * 100) / 100,
      };
    });
    const subtotal = Math.round(orderItems.reduce((sum, item) => sum + item.line_total, 0) * 100) / 100;
    if (!Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 2000000) {
      return respond(400, { error: "The order total is outside the allowed range." });
    }

    // Delivery is deliberately fixed at zero until the store's delivery rates are configured.
    const deliveryFee = 0;
    const orderNumber = "CIC-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + crypto.randomUUID().slice(0, 8).toUpperCase();
    const { data: order, error: orderError } = await admin.from("store_orders").insert({
      order_number: orderNumber,
      customer_id: user.id,
      customer_name: customerName,
      email: user.email || null,
      phone,
      shipping_address: { line1: addressLine, line2: cleanText(address?.line2, 180), city, district, postal_code: cleanText(address?.postal_code, 20), country: "Sri Lanka" },
      currency: "LKR",
      subtotal,
      delivery_fee: deliveryFee,
      total: subtotal + deliveryFee,
      payment_method: paymentMethod,
      payment_status: "pending",
      order_status: "pending",
      customer_note: note || null,
    }).select("id,order_number,subtotal,delivery_fee,total,payment_method,payment_status,order_status,created_at").single();
    if (orderError || !order) {
      console.error("Order insert failed", orderError?.message);
      return respond(500, { error: "We could not save your order. Please try again." });
    }

    const { error: itemsError } = await admin.from("store_order_items").insert(orderItems.map((item) => ({ ...item, order_id: order.id })));
    if (itemsError) {
      console.error("Order item insert failed", itemsError.message);
      await admin.from("store_orders").delete().eq("id", order.id);
      return respond(500, { error: "We could not save all order items. No order was kept; please try again." });
    }

    // Optional external notifications. Order creation must succeed even if an external provider is not configured or is temporarily unavailable.
    const notificationPayload = {
      event: "order.created",
      order: {
        order_number: order.order_number,
        created_at: order.created_at,
        customer_name: customerName,
        email: user.email || null,
        phone,
        shipping_address: { line1: addressLine, line2: cleanText(address?.line2, 180), city, district, postal_code: cleanText(address?.postal_code, 20), country: "Sri Lanka" },
        currency: "LKR",
        subtotal,
        delivery_fee: deliveryFee,
        total: subtotal + deliveryFee,
        payment_method: paymentMethod,
        payment_status: "pending",
        order_status: "pending",
        customer_note: note || null,
      },
      items: orderItems,
    };

    const notificationTasks: Promise<void>[] = [];
    const sheetsUrl = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") || "";
    const sheetsSecret = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_SECRET") || "";
    if (sheetsUrl && sheetsSecret) {
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
          if (!response.ok) console.error("Google Sheets order sync returned HTTP", response.status);
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
    if (waToken && waPhoneId && waAdmin && waTemplate) {
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
          if (!response.ok) console.error("WhatsApp owner notification returned HTTP", response.status);
        } catch (e) {
          console.error("WhatsApp owner notification failed", e instanceof Error ? e.message : "unknown error");
        }
      })());
    }

    // These integrations are deliberately best-effort; never lose a saved order because a notification provider is down.
    await Promise.all(notificationTasks);

    return respond(201, { order, items: orderItems, notifications: {
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