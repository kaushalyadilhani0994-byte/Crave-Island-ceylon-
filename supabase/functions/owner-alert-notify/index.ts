import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://craveislandceylonv18supabaseintegra.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sendTelegram(text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { sent: false, reason: "telegram_not_configured" };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Telegram delivery failed (${res.status}): ${detail.slice(0, 180)}`);
  }
  return { sent: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return response({ error: "Server configuration is incomplete." }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let parsedPayload: unknown;
  try { parsedPayload = await req.json(); } catch { return response({ error: "Invalid request body." }, 400); }
  if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
    return response({ error: "Request body must be a JSON object." }, 400);
  }
  const payload = parsedPayload as { action?: string; alert_id?: string };

  const cronHeader = req.headers.get("x-cron-secret") || "";
  const { data: cronConfig } = await admin.from("owner_report_cron_config").select("cron_secret").eq("id", true).maybeSingle();
  const validCronSecret = !!cronConfig?.cron_secret && cronHeader === cronConfig.cron_secret;
  const isScheduledReport = payload.action === "daily_summary" && validCronSecret;
  const isScheduledAlertDispatcher = payload.action === "notify_pending_alerts" && validCronSecret;
  const isScheduledRequest = isScheduledReport || isScheduledAlertDispatcher;

  const authHeader = req.headers.get("Authorization") || "";
  let userId: string | null = null;
  let userEmail: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (!userError && userData.user) {
      userId = userData.user.id;
      userEmail = userData.user.email || null;
    } else if (!isScheduledRequest) {
      return response({ error: "Valid sign-in required." }, 401);
    }
  } else if (!isScheduledRequest) {
    return response({ error: "Sign-in required." }, 401);
  }

  const { data: staff, error: staffError } = userId
    ? await admin.from("staff_profiles").select("role,approved").eq("id", userId).maybeSingle()
    : { data: null, error: null };
  const isOwner = isScheduledReport || (!staffError && !!staff && staff.role === "owner" && staff.approved === true);

  if (payload.action === "log_denied_owner_access") {
    if (isOwner) return response({ error: "Approved owners cannot log a denied-owner event." }, 403);
    const hourKey = new Date().toISOString().slice(0, 13);
    const dedupeKey = `security-denied:${userId || ""}:${hourKey}`;
    const email = String(userEmail || "email unavailable").slice(0, 180);
    const { error: insertError } = await admin.from("admin_alerts").upsert({
      dedupe_key: dedupeKey,
      alert_type: "security",
      severity: "critical",
      title: "Unapproved account tried to access Owner Admin",
      message: `An authenticated account without approved owner permissions attempted to open owner tools. Account: ${email}. Review staff access and audit logs.`,
      entity_type: "auth_user",
      entity_id: userId || "",
      status: "open",
      updated_at: new Date().toISOString(),
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (insertError) return response({ error: "Security event could not be recorded." }, 500);
    const { data: alert } = await admin.from("admin_alerts").select("id,title,message,notification_sent_at").eq("dedupe_key", dedupeKey).maybeSingle();
    let notification = { sent: false, reason: "not_sent" };
    if (alert && !alert.notification_sent_at) {
      try {
        notification = await sendTelegram(`🔴 CRAVE ISLAND CEYLON SECURITY ALERT\n${alert.title}\n${alert.message}\nTime: ${new Date().toISOString()}`);
        if (notification.sent) await admin.from("admin_alerts").update({ notification_sent_at: new Date().toISOString(), notification_attempted_at: new Date().toISOString(), notification_error: null }).eq("id", alert.id);
        else await admin.from("admin_alerts").update({ notification_attempted_at: new Date().toISOString(), notification_error: "Telegram bot/chat secrets are not configured." }).eq("id", alert.id);
      } catch (e) {
        await admin.from("admin_alerts").update({ notification_attempted_at: new Date().toISOString(), notification_error: String(e).slice(0, 300) }).eq("id", alert.id);
      }
    }
    return response({ recorded: true, notification_configured: notification.sent });
  }

  if (payload.action === "notify_pending_alerts") {
    if (!isScheduledAlertDispatcher) return response({ error: "Scheduled notification authorization required." }, 403);
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: pending, error: pendingError } = await admin
        .from("admin_alerts")
        .select("id,title,message,severity,notification_attempted_at")
        .eq("status", "open")
        .is("notification_sent_at", null)
        .or("notification_attempted_at.is.null,notification_attempted_at.lt." + cutoff)
        .order("created_at", { ascending: true })
        .limit(10);
      if (pendingError) return response({ error: "Could not load pending alerts." }, 500);
      let sent = 0;
      let failed = 0;
      for (const alert of pending || []) {
        const attemptedAt = new Date().toISOString();
        try {
          const result = await sendTelegram(`${alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟠" : "🔔"} CRAVE ISLAND CEYLON ALERT\n${alert.title}\n${alert.message}\nTime: ${attemptedAt} (Sri Lanka)`);
          if (result.sent) {
            const { error: updateError } = await admin.from("admin_alerts")
              .update({ notification_sent_at: attemptedAt, notification_attempted_at: attemptedAt, notification_error: null })
              .eq("id", alert.id).is("notification_sent_at", null);
            if (updateError) failed++; else sent++;
          } else {
            failed++;
            await admin.from("admin_alerts").update({ notification_attempted_at: attemptedAt, notification_error: "Telegram bot/chat secrets are not configured." }).eq("id", alert.id);
          }
        } catch (e) {
          failed++;
          await admin.from("admin_alerts").update({ notification_attempted_at: attemptedAt, notification_error: String(e).slice(0, 300) }).eq("id", alert.id);
        }
      }
      return response({ processed: (pending || []).length, sent, failed });
  }

  if (payload.action === "daily_summary") {
    if (!isOwner) return response({ error: "Approved owner access required." }, 403);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const colomboDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const [colomboYear, colomboMonth, colomboDay] = colomboDate.split("-").map(Number);
    const todayStart = new Date(Date.UTC(colomboYear, colomboMonth - 1, colomboDay) - 330 * 60 * 1000).toISOString();
    const [ordersRes, productsRes, categoriesRes, alertsRes] = await Promise.all([
      admin.from("store_orders").select("id,order_status,created_at").gte("created_at", todayStart),
      admin.from("products").select("id,is_active,track_inventory,stock_quantity,low_stock_threshold,expiry_date"),
      admin.from("categories").select("id,parent_id,is_active"),
      admin.from("admin_alerts").select("id,alert_type,severity,title,created_at").eq("status","open").order("created_at",{ascending:false}).limit(50)
    ]);
    if (ordersRes.error || productsRes.error || categoriesRes.error || alertsRes.error) {
      const failed = [
        ordersRes.error ? "orders: " + ordersRes.error.message : null,
        productsRes.error ? "products: " + productsRes.error.message : null,
        categoriesRes.error ? "categories: " + categoriesRes.error.message : null,
        alertsRes.error ? "alerts: " + alertsRes.error.message : null,
      ].filter(Boolean);
      console.error("daily_summary database query failed", failed);
      return response({ error: "Could not build the daily report.", message: "Report database check failed — " + failed.join(" | ") });
    }
    const orders = ordersRes.data || [];
    const products = productsRes.data || [];
    const categories = categoriesRes.data || [];
    const alerts = alertsRes.data || [];
    const tracked = products.filter(p => p.track_inventory);
    const low = tracked.filter(p => Number(p.stock_quantity || 0) <= Number(p.low_stock_threshold || 0));
    const today = colomboDate;
    const limit = new Date(now.getTime()+30*86400000).toISOString().slice(0,10);
    const expired = products.filter(p => p.expiry_date && p.expiry_date < today);
    const dueSoon = products.filter(p => p.expiry_date && p.expiry_date >= today && p.expiry_date <= limit);
    const recent = orders.filter(o => o.created_at >= since);
    const critical = alerts.filter(a => a.severity === "critical").length;
    const warning = alerts.filter(a => a.severity === "warning").length;
    const lines = [
      "📊 CRAVE ISLAND CEYLON — DAILY OWNER REPORT",
      "Generated: " + now.toLocaleString("en-GB", { timeZone: "Asia/Colombo" }) + " (Sri Lanka)",
      "Orders today: " + orders.length,
      "Orders in last 24 hours: " + recent.length,
      "Active products: " + products.filter(p => p.is_active).length + " / " + products.length,
      "Active main categories: " + categories.filter(c => c.is_active && !c.parent_id).length,
      "Tracked stock items: " + tracked.length,
      "Low/out-of-stock tracked items: " + low.length,
      "Expired items recorded: " + expired.length,
      "Expiry within 30 days: " + dueSoon.length,
      "Open alerts: " + alerts.length + " (critical " + critical + ", warning " + warning + ")",
      ...alerts.slice(0,8).map(a => (a.severity === "critical" ? "🔴 " : "🟠 ") + a.title),
      "",
      "Privacy note: this report contains counts and alert titles, not customer contact details."
    ];
    let delivery;
    try {
      delivery = await sendTelegram(lines.join("\n"));
    } catch (e) {
      const detail = String(e).slice(0, 240);
      console.error("daily_summary Telegram delivery failed", detail);
      return response({ sent:false, error:"Telegram delivery failed.", message:detail });
    }
    if (!delivery.sent) return response({ sent:false, reason:delivery.reason, message:"Telegram secrets are missing: confirm TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are saved under Edge Function secrets." });
    return response({ sent:true, ordersToday:orders.length, activeProducts:products.filter(p=>p.is_active).length, activeMainCategories:categories.filter(c=>c.is_active&&!c.parent_id).length, openAlerts:alerts.length });
  }

  if (!isOwner) return response({ error: "Approved owner access required." }, 403);
  const alertId = String(payload.alert_id || "");
  if (!alertId) return response({ error: "alert_id is required." }, 400);
  const { data: alert, error: alertError } = await admin.from("admin_alerts").select("id,title,message,severity,status,notification_sent_at").eq("id", alertId).maybeSingle();
  if (alertError || !alert) return response({ error: "Alert not found." }, 404);
  if (alert.notification_sent_at) return response({ sent: true, already_sent: true });
  try {
    const result = await sendTelegram(`${alert.severity === "critical" ? "🔴" : "🟠"} CRAVE ISLAND CEYLON ALERT\n${alert.title}\n${alert.message}\nTime: ${new Date().toISOString()}`);
    if (!result.sent) {
      await admin.from("admin_alerts").update({ notification_attempted_at: new Date().toISOString(), notification_error: "Telegram bot/chat secrets are not configured." }).eq("id", alert.id);
      return response({ sent: false, reason: result.reason, message: "Add Telegram bot token and chat ID to Edge Function secrets to enable push notifications." });
    }
    await admin.from("admin_alerts").update({ notification_sent_at: new Date().toISOString(), notification_attempted_at: new Date().toISOString(), notification_error: null }).eq("id", alert.id);
    return response({ sent: true });
  } catch (e) {
    await admin.from("admin_alerts").update({ notification_attempted_at: new Date().toISOString(), notification_error: String(e).slice(0, 300) }).eq("id", alert.id);
    return response({ sent: false, error: "Telegram delivery failed. Check bot settings and function logs." }, 502);
  }
});