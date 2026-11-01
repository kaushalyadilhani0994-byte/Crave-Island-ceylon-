import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!url || !serviceKey || !token) return reply(401, { error: "Sign in as an approved owner." });

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return reply(401, { error: "Session invalid or expired." });

    const { data: staff, error: staffError } = await admin.from("staff_profiles")
      .select("role,approved,permissions").eq("id", authData.user.id).maybeSingle();
    if (staffError || !staff || staff.approved !== true) {
      return reply(403, { error: "An approved CRAVE team account is required." });
    }
    const isOwner = staff.role === "owner";
    const permissions = staff.permissions && typeof staff.permissions === "object" ? staff.permissions as Record<string, unknown> : {};
    const hasOrdersUpdate = Array.isArray(permissions.orders) && permissions.orders.includes("update");
    const hasDispatchUpdate = Array.isArray(permissions.dispatch) && permissions.dispatch.includes("update");
    if (!isOwner && !hasOrdersUpdate && !hasDispatchUpdate) {
      return reply(403, { error: "Your account does not have order-status update permission." });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON." }); }
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    const next = typeof body.order_status === "string" ? body.order_status.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply(400, { error: "Valid order ID required." });
    if (!["confirmed", "processing", "shipped", "delivered", "cancelled"].includes(next)) {
      return reply(400, { error: "Unsupported order status." });
    }

    const { data: order, error } = await admin.from("store_orders")
      .select("id,order_number,order_status").eq("id", orderId).maybeSingle();
    if (error) return reply(500, { error: "Could not read order." });
    if (!order) return reply(404, { error: "Order not found." });

    const transitions: Record<string, string[]> = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    const allowedTransitions = isOwner || hasOrdersUpdate
      ? (transitions[order.order_status] || [])
      : order.order_status === "processing" && next === "shipped"
        ? ["shipped"]
        : order.order_status === "shipped" && next === "delivered"
          ? ["delivered"]
          : [];
    if (!allowedTransitions.includes(next)) {
      return reply(403, { error: "This status change is outside your assigned order/dispatch permissions." });
    }

    const { data: updated, error: updateError } = await admin.from("store_orders")
      .update({ order_status: next }).eq("id", orderId).eq("order_status", order.order_status)
      .select("id,order_number,order_status,updated_at").maybeSingle();
    if (updateError) return reply(500, { error: "Could not update order." });
    if (!updated) return reply(409, { error: "Order changed; refresh and retry." });
    return reply(200, { order: updated });
  } catch (error) {
    console.error("update-order-status error", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "Unexpected server error." });
  }
});