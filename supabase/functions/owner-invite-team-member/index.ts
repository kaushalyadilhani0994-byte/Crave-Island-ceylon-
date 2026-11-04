import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const OWNER_EMAILS = new Set([
  "kaushalyadilhani0994@gmail.com",
]);

function isAllowedOrigin(origin: string | null): origin is string {
  return origin === "https://craveislandceylonv18supabaseintegra.vercel.app"
    || (!!origin && /^https:\/\/craveislandceylonv18supabaseintegratedbuild-[a-z0-9-]+\.vercel\.app$/.test(origin));
}

function cors(origin: string | null) {
  const allowed = isAllowedOrigin(origin);
  return { ...corsHeaders, "Access-Control-Allow-Origin": allowed ? origin : "https://craveislandceylonv18supabaseintegra.vercel.app" };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!isAllowedOrigin(origin)) return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...headers, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "authentication_required" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
    }
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user || userData.user.is_anonymous) {
      return new Response(JSON.stringify({ error: "invalid_session" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ownerEmail = String(userData.user.email || "").trim().toLowerCase();
    const { data: ownerProfile, error: ownerError } = await admin.from("staff_profiles")
      .select("role,approved").eq("id", userData.user.id).maybeSingle();
    if (!OWNER_EMAILS.has(ownerEmail) || ownerError || ownerProfile?.role !== "owner" || ownerProfile?.approved !== true) {
      return new Response(JSON.stringify({ error: "owner_access_required" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
    }

    let parsedBody: unknown;
    try { parsedBody = await req.json(); } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return new Response(JSON.stringify({ error: "request_body_must_be_object" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }
    const body = parsedBody as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const role = typeof body.role === "string" ? body.role : "";
    const validRoles = ["supervisor", "staff", "media", "accounts", "star_club"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || displayName.length > 100 || !validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "valid_email_and_role_required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const redirectTo = origin && headers["Access-Control-Allow-Origin"] === origin ? origin + "/" : "https://craveislandceylonv18supabaseintegra.vercel.app/";
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName, crave_team_invite: true },
      redirectTo,
    });
    if (inviteError || !invited.user) {
      return new Response(JSON.stringify({ error: inviteError?.message || "invite_failed" }), { status: 409, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const { error: profileError } = await admin.from("staff_profiles").upsert({
      id: invited.user.id,
      email,
      display_name: displayName || email.split("@")[0],
      role,
      approved: false,
      permissions: {},
    }, { onConflict: "id" });
    if (profileError) {
      // The Auth invite and profile write are separate services. Compensate by
      // deleting the just-created invited identity so it cannot remain orphaned.
      const { error: cleanupError } = await admin.auth.admin.deleteUser(invited.user.id);
      return new Response(JSON.stringify({
        error: cleanupError ? "invite_profile_failed_cleanup_required" : "invite_profile_failed_and_invite_cancelled",
        recoverable: !!cleanupError,
        user_id: cleanupError ? invited.user.id : undefined,
      }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, invited: email, role, approved: false, message: "Invitation sent. Approve this team member after they accept and sign in." }), {
      status: 200, headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "unexpected_error" }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
