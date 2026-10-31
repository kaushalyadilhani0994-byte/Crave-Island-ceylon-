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

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "POST required." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!url || !serviceKey || !token) return reply(401, { error: "Sign in required." });

  try {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user || authData.user.is_anonymous) {
      return reply(401, { error: "A valid registered account is required." });
    }

    const { data: staff, error: staffError } = await admin.from("staff_profiles")
      .select("role,approved,permissions").eq("id", authData.user.id).maybeSingle();
    if (staffError || !staff || staff.approved !== true) {
      return reply(403, { error: "An approved CRAVE team account is required." });
    }
    const permissions = staff.permissions && typeof staff.permissions === "object"
      ? staff.permissions as Record<string, unknown> : {};
    const inventoryActions = Array.isArray(permissions.inventory) ? permissions.inventory : [];
    if (staff.role !== "owner" && !inventoryActions.includes("update")) {
      return reply(403, { error: "Inventory update permission is required." });
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply(400, { error: "Invalid JSON." }); }
    const productId = typeof body.product_id === "string" ? body.product_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
      return reply(400, { error: "Valid product ID required." });
    }

    const updates: Record<string, unknown> = {};
    if (Object.hasOwn(body, "stock_quantity")) {
      const value = Number(body.stock_quantity);
      if (!Number.isInteger(value) || value < 0 || value > 1000000) {
        return reply(400, { error: "Stock quantity must be a whole number from 0 to 1,000,000." });
      }
      updates.stock_quantity = value;
    }
    if (Object.hasOwn(body, "low_stock_threshold")) {
      const value = Number(body.low_stock_threshold);
      if (!Number.isInteger(value) || value < 0 || value > 1000000) {
        return reply(400, { error: "Low-stock threshold must be a whole number from 0 to 1,000,000." });
      }
      updates.low_stock_threshold = value;
    }
    if (Object.hasOwn(body, "track_inventory")) {
      if (typeof body.track_inventory !== "boolean") return reply(400, { error: "track_inventory must be true or false." });
      updates.track_inventory = body.track_inventory;
    }
    if (Object.hasOwn(body, "expiry_date")) {
      const value = body.expiry_date;
      if (value !== null && !isValidIsoDate(value)) {
        return reply(400, { error: "Expiry date must be a real YYYY-MM-DD date or null." });
      }
      updates.expiry_date = value;
    }
    if (!Object.keys(updates).length) return reply(400, { error: "No permitted inventory fields supplied." });

    updates.updated_at = new Date().toISOString();
    const { data: updated, error: updateError } = await admin.from("products")
      .update(updates).eq("id", productId)
      .select("id,name,stock_quantity,low_stock_threshold,track_inventory,expiry_date,updated_at")
      .maybeSingle();
    if (updateError) {
      console.error("Inventory update failed", updateError.message);
      return reply(500, { error: "Inventory could not be updated." });
    }
    if (!updated) return reply(404, { error: "Product not found." });
    return reply(200, { product: updated });
  } catch (error) {
    console.error("update-product-inventory error", error instanceof Error ? error.message : "unknown");
    return reply(500, { error: "Unexpected server error." });
  }
});
