import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function cors(origin: string | null) {
  const allowed = origin === "https://craveislandceylonv18supabaseintegra.vercel.app"
    || (!!origin && /^https:\/\/craveislandceylonv18supabaseintegratedbuild-[a-z0-9-]+\.vercel\.app$/.test(origin));
  return { ...corsHeaders, "Access-Control-Allow-Origin": allowed ? origin! : "https://craveislandceylonv18supabaseintegra.vercel.app" };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
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
    const { data: ownerProfile, error: ownerError } = await admin.from("staff_profiles")
      .select("role,approved").eq("id", userData.user.id).maybeSingle();
    if (ownerError || ownerProfile?.role !== "owner" || ownerProfile?.approved !== true) {
      return new Response(JSON.stringify({ error: "owner_access_required" }), { status: 403, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.display_name || "").trim().slice(0, 100);
    const role = String(body.role || "");
    const validRoles = ["supervisor", "staff", "media", "accounts", "star_club"];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validRoles.includes(role)) {
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
      return new Response(JSON.stringify({ error: "invite_sent_but_profile_setup_failed", detail: profileError.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
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
