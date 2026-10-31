import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const PRODUCTION_ORIGIN = "https://craveislandceylonv18supabaseintegra.vercel.app";
function cors(origin: string | null) {
  const allowed = origin === PRODUCTION_ORIGIN
    || (!!origin && /^https:\/\/craveislandceylonv18supabaseintegratedbuild-[a-z0-9-]+\.vercel\.app$/.test(origin));
  return { ...corsHeaders, "Access-Control-Allow-Origin": allowed ? origin! : PRODUCTION_ORIGIN };
}
function respond(body: Record<string, unknown>, status: number, headers: Record<string,string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return respond({error:"method_not_allowed"},405,headers);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return respond({error:"server_configuration_error"},500,headers);
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({error:"authentication_required"},401,headers);

    const userClient = createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:userData,error:userError}=await userClient.auth.getUser();
    if (userError || !userData.user) return respond({error:"invalid_session"},401,headers);

    const admin = createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const actorId = userData.user.id;
    const {data:actor,error:actorError}=await admin.from("staff_profiles").select("role,approved").eq("id",actorId).maybeSingle();
    if (actorError || actor?.role!=="owner" || actor?.approved!==true) return respond({error:"owner_access_required"},403,headers);

    const body = await req.json();
    const action = String(body.action || "");
    if (action === "list") {
      const {data,error}=await admin.from("staff_profiles")
        .select("id,email,display_name,role,approved,permissions,created_at")
        .in("role",["supervisor","staff","media","accounts","star_club"])
        .order("created_at",{ascending:false});
      if (error) return respond({error:"team_list_failed"},500,headers);
      return respond({ok:true,members:data||[]},200,headers);
    }

    const targetId = String(body.target_user_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId))
      return respond({error:"valid_target_user_id_required"},400,headers);
    const permissions = action === "set_permissions" ? body.permissions : null;
    if (!["approve","suspend","set_permissions"].includes(action))
      return respond({error:"unsupported_action"},400,headers);

    const {data,error}=await admin.rpc("owner_manage_team_member",{
      p_actor_id:actorId,p_target_user_id:targetId,p_action:action,p_permissions:permissions
    });
    if (error) {
      const status = error.code==="42501" ? 403 : error.code==="P0002" ? 404 : 400;
      return respond({error:"team_update_rejected"},status,headers);
    }
    return respond(data as Record<string,unknown>,200,headers);
  } catch (_) {
    return respond({error:"unexpected_error"},500,headers);
  }
});
