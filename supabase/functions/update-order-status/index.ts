import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const PRODUCTION_ORIGIN="https://craveislandceylonv18supabaseintegra.vercel.app";
function allowedOrigin(origin:string|null):boolean{return origin===PRODUCTION_ORIGIN||!!origin&&/^https:\/\/craveislandceylonv18supabaseintegratedbuild-[a-z0-9-]+\.vercel\.app$/.test(origin);}
function cors(origin:string|null){return {"Access-Control-Allow-Origin":allowedOrigin(origin)&&origin?origin:PRODUCTION_ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json"};}
function reply(status:number,body:Record<string,unknown>,origin:string|null){return new Response(JSON.stringify(body),{status,headers:cors(origin)});}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(!allowedOrigin(origin))return reply(403,{error:"origin_not_allowed"},origin);
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return reply(405,{error:"POST required."},origin);
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const authorization=req.headers.get("Authorization")||"",token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!url||!serviceKey||!token)return reply(401,{error:"Sign in as an approved CRAVE team member."},origin);
 try{
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await admin.auth.getUser(token);
  if(authError||!authData.user||authData.user.is_anonymous)return reply(401,{error:"A valid registered account is required."},origin);
  const {data:staff,error:staffError}=await admin.from("staff_profiles").select("role,approved,permissions").eq("id",authData.user.id).maybeSingle();
  if(staffError||!staff||staff.approved!==true)return reply(403,{error:"An approved CRAVE team account is required."},origin);
  const isOwner=staff.role==="owner",permissions=staff.permissions&&typeof staff.permissions==="object"?staff.permissions as Record<string,unknown>:{};
  const canOrdersUpdate=Array.isArray(permissions.orders)&&permissions.orders.includes("update");
  const canDispatchUpdate=Array.isArray(permissions.dispatch)&&permissions.dispatch.includes("update");
  if(!isOwner&&!canOrdersUpdate&&!canDispatchUpdate)return reply(403,{error:"Your account does not have order-status update permission."},origin);
  let body:unknown;try{body=await req.json();}catch{return reply(400,{error:"Invalid JSON."},origin);}
  if(!body||typeof body!=="object"||Array.isArray(body))return reply(400,{error:"Request body must be a JSON object."},origin);
  const input=body as Record<string,unknown>,orderId=typeof input.order_id==="string"?input.order_id.trim():"",next=typeof input.order_status==="string"?input.order_status.trim():"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId))return reply(400,{error:"Valid order ID required."},origin);
  if(!["confirmed","processing","shipped","delivered","cancelled"].includes(next))return reply(400,{error:"Unsupported order status."},origin);
  if(!isOwner&&!canOrdersUpdate&&next!=="shipped"&&next!=="delivered")return reply(403,{error:"Dispatch access is limited to shipping and delivery updates."},origin);
  const {data,error}=await admin.rpc("owner_update_store_order_status",{p_order_id:orderId,p_next_status:next});
  if(error){const message=error.message||"";if(message.includes("ORDER_NOT_FOUND"))return reply(404,{error:"Order not found."},origin);if(message.includes("ORDER_STATUS_TRANSITION_NOT_ALLOWED"))return reply(409,{error:"This order status transition is not allowed. Refresh and try again."},origin);console.error("update-order-status RPC error",message);return reply(500,{error:"Could not update order status."},origin);}
  return reply(200,data&&typeof data==="object"?data:{ok:true},origin);
 }catch(error){console.error("update-order-status error",error instanceof Error?error.message:"unknown");return reply(500,{error:"Unexpected server error."},origin);}
});