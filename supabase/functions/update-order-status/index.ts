import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") || "", token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!url || !key || !token) return reply(401, { error: "Sign in as an approved owner." });
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: a, error: ae } = await db.auth.getUser(token);
    if (ae || !a.user) return reply(401, { error: "Session invalid or expired." });
    const { data: staff, error: se } = await db.from("staff_profiles").select("role,approved").eq("id", a.user.id).maybeSingle();
    if (se || !staff || staff.approved !== true || staff.role !== "owner") return reply(403, { error: "Only an approved owner can update order status." });
    let b: Record<string, unknown>; try { b = await req.json(); } catch { return reply(400, { error: "Invalid JSON." }); }
    const id = typeof b.order_id === "string" ? b.order_id.trim() : "", next = typeof b.order_status === "string" ? b.order_status.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply(400, { error: "Valid order ID required." });
    if (!["confirmed", "processing", "shipped", "delivered", "cancelled"].includes(next)) return reply(400, { error: "Unsupported order status." });
    const { data: order, error } = await db.from("store_orders").select("id,order_number,order_status").eq("id", id).maybeSingle();
    if (error) return reply(500, { error: "Could not read order." });
    if (!order) return reply(404, { error: "Order not found." });
    const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["processing", "cancelled"], processing: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };
    if (!(transitions[order.order_status] || []).includes(next)) return reply(409, { error: "Invalid status transition." });
    const { data: updated, error: ue } = await db.from("store_orders").update({ order_status: next }).eq("id", id).eq("order_status", order.order_status).select("id,order_number,order_status,updated_at").maybeSingle();
    if (ue) return reply(500, { error: "Could not update order." });
    if (!updated) return reply(409, { error: "Order changed; refresh and retry." });
    return reply(200, { order: updated });
  } catch (e) {
    console.error("update-order-status error", e instanceof Error ? e.message : "unknown");
    return reply(500, { error: "Unexpected server error." });
  }
});