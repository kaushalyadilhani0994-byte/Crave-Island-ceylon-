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
      .select("role,approved").eq("id", authData.user.id).maybeSingle();
    if (staffError || !staff || staff.approved !== true || staff.role !== "owner") {
      return reply(403, { error: "Only an approved owner can update order status." });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON." }); }
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    const next = typeof body.order_status === "string" ? body.order_status.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply(400, { error: "Valid order ID required." });
    if (!["confirmed", "processing", "shipped", "delivered", "cancelled"].includes(next)) {
      return reply(400, { error: "Unsupported order status." });
    }


    const { data: result, error: updateError } = await admin.rpc("owner_update_store_order_status", {
      p_order_id: orderId,
      p_next_status: next,
    });
    if (updateError || !result || result.ok !== true) {
      const reason = updateError?.message || "order_status_update_failed";
      console.error("Atomic order status update failed", reason);
      if (/ORDER_NOT_FOUND/i.test(reason)) return reply(404, { error: "Order not found." });
      if (/ORDER_STATUS_TRANSITION_NOT_ALLOWED/i.test(reason)) return reply(409, { error: "Invalid status transition. Refresh the order and try again." });
      return reply(500, { error: "Could not update order status securely." });
    }
    return reply(200, {
      order: {
        id: result.order_id,
        order_number: result.order_number,
        order_status: result.order_status,
        delivered_at: result.delivered_at || null,
      },
      replayed: result.replayed === true,
    });
  } catch (error) {
    console.error("update-order-status error", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "Unexpected server error." });
  }
});