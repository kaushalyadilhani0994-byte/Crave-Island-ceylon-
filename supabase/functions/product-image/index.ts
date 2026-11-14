import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  const productId = new URL(req.url).searchParams.get("product_id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) {
    return Response.json({ error: "Invalid product" }, { status: 400, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return Response.json({ error: "Image service unavailable" }, { status: 503, headers: corsHeaders });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: product, error: productError } = await admin
    .from("products").select("id,image_url,is_active").eq("id", productId).eq("is_active", true).maybeSingle();
  if (productError || !product || typeof product.image_url !== "string") {
    return Response.json({ error: "Image not found" }, { status: 404, headers: corsHeaders });
  }

  const objectPath = product.image_url.trim();
  if (!objectPath.startsWith(productId + "/") || objectPath.includes("..") || objectPath.startsWith("/")) {
    return Response.json({ error: "Image not found" }, { status: 404, headers: corsHeaders });
  }

  const { data: passport, error: passportError } = await admin
    .from("product_passports").select("published").eq("product_id", productId).eq("published", true).maybeSingle();
  if (passportError || !passport?.published) {
    return Response.json({ error: "Image not found" }, { status: 404, headers: corsHeaders });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("product-images").createSignedUrl(objectPath, 900);
  if (signError || !signed?.signedUrl) {
    return Response.json({ error: "Image temporarily unavailable" }, { status: 503, headers: corsHeaders });
  }

  return Response.json({ url: signed.signedUrl, expires_in: 900 }, { headers: corsHeaders });
});
