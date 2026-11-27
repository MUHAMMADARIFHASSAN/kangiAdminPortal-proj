// Supabase Edge Function: admin-user-emails
//
// Returns every user's email and last sign-in time, for the admin
// dashboard's Users tab. Emails live in Supabase Auth, which the browser
// cannot read, so this runs on the server with the service_role key.
// The key never leaves Supabase.
//
// Only a signed-in admin (profiles.is_admin = true and not banned) gets an
// answer; everyone else gets 401 / 403.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new function →
// name it "admin-user-emails" → paste this file → Deploy.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase automatically.

import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-product-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Who is calling? (the dashboard sends the admin's access token)
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Not signed in." }, 401);

  // 2. Is the caller an admin who is not banned?
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin, is_banned")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin || profile.is_banned) return json({ error: "Admins only." }, 403);

  // 3. Every user's email, page by page.
  const users: { id: string; email: string | null; last_sign_in_at: string | null }[] = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return json({ error: error.message }, 500);
    for (const u of data.users) {
      users.push({ id: u.id, email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null });
    }
    if (data.users.length < perPage) break;
  }

  return json({ users });
});
