// Rx Fingertip Care — mobile number + PIN accounts.
// signup: anyone can create an account for a mobile number (no email or SMS is sent).
// reset:  only an app admin (listed in public.app_admins) can set a new PIN for a number.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PHONE = /^[6-9][0-9]{9}$/;
const PIN = /^[0-9]{6}$/;
const phoneEmail = (p: string) => `91${p}@phone.rxfingertip.app`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { action?: string; phone?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const phone = String(body.phone ?? "").replace(/\D/g, "").replace(/^(91|0)(?=[6-9]\d{9}$)/, "");
  const pin = String(body.pin ?? "");
  if (!PHONE.test(phone)) return json({ error: "bad_phone" }, 400);
  if (!PIN.test(pin)) return json({ error: "bad_pin" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (body.action === "signup") {
    const { data: taken } = await admin.from("phone_accounts").select("phone").eq("phone", phone).maybeSingle();
    if (taken) return json({ error: "exists" }, 409);
    const { data, error } = await admin.auth.admin.createUser({
      email: phoneEmail(phone), password: pin, email_confirm: true, user_metadata: { phone },
    });
    if (error || !data.user) {
      return json({ error: /already/i.test(error?.message ?? "") ? "exists" : "create_failed", detail: error?.message }, 400);
    }
    const ins = await admin.from("phone_accounts").insert({ phone, user_id: data.user.id });
    if (ins.error) { await admin.auth.admin.deleteUser(data.user.id); return json({ error: "create_failed" }, 500); }
    return json({ ok: true });
  }

  if (body.action === "reset") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "not_signed_in" }, 401);
    const { data: isAdmin } = await admin.from("app_admins").select("user_id").eq("user_id", caller.user.id).maybeSingle();
    if (!isAdmin) return json({ error: "not_admin" }, 403);
    const { data: acct } = await admin.from("phone_accounts").select("user_id").eq("phone", phone).maybeSingle();
    if (!acct) return json({ error: "no_account" }, 404);
    const { error } = await admin.auth.admin.updateUserById(acct.user_id, { password: pin });
    if (error) return json({ error: "reset_failed", detail: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "bad_action" }, 400);
});
