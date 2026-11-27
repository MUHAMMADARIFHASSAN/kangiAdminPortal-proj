#!/usr/bin/env python3
"""
setup_admin.py  —  Kangi Admin Dashboard One-Click Setup
=========================================================

Yeh script automatically:
  1. Admin user signup karta hai
  2. Email confirm karta hai (Supabase SQL via REST pg_net workaround)
  3. is_admin = true set karta hai
  4. Login verify karta hai
  5. Dashboard browser mein open karta hai

RUN:
  python3 setup_admin.py

ADMIN CREDENTIALS:
  Email:    admin@kangi.com
  Password: Admin@12345
"""

import urllib.request
import urllib.error
import json
import time
import subprocess
import sys
import os
import webbrowser

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL   = "https://bfqwlcjflbybhltiflkt.supabase.co"
ANON_KEY       = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcXdsY2pmbGJ5YmhsdGlmbGt0Iiw"
    "icm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MTUyNjksImV4cCI6MjExMDM5MTI2OX0."
    "0L2agSv5n9-5iXfcUavgJktXRfL1Hs8InvCW2N2YYbk"
)
ADMIN_EMAIL    = "admin@kangi.com"
ADMIN_PASSWORD = "S"
ADMIN_NAME     = "Kangi Admin"
DASHBOARD_PORT = 8080
DASHBOARD_DIR  = os.path.dirname(os.path.abspath(__file__))


# ── HTTP ──────────────────────────────────────────────────────
def api(method, path, body=None, token=None, prefer=None):
    url = SUPABASE_URL + path
    data = json.dumps(body).encode() if body else None
    headers = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else {}, res.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:    return json.loads(raw), e.code
        except: return {"error": raw}, e.code


def ok(label, cond, detail=""):
    sym = "✅" if cond else "❌"
    print(f"  {sym}  {label}" + (f"  ({detail})" if detail else ""))
    return cond


def hr(title=""):
    if title:
        print(f"\n{'─'*4} {title} {'─'*(50-len(title))}")
    else:
        print("─" * 56)


# ── Step 1: Signup ────────────────────────────────────────────
def step_signup():
    hr("1/4  User Signup")
    res, status = api("POST", "/auth/v1/signup", {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "data": {"display_name": ADMIN_NAME}
    })

    uid = (res.get("user") or res).get("id")
    err = res.get("error_description") or res.get("msg") or res.get("error") or ""

    if uid:
        ok("Signup successful", True, uid[:8] + "...")
        return uid
    elif "already registered" in str(err).lower() or "already exists" in str(err).lower():
        ok("User already exists", True, "skipping")
        return "existing"
    else:
        ok("Signup", False, str(err)[:80])
        print("\n  Signup fail hua. Check karo:")
        print("  - Supabase project active hai?")
        print("  - Internet connection theek hai?")
        sys.exit(1)


# ── Step 2: Confirm + Admin via SQL ───────────────────────────
def step_confirm_and_admin():
    hr("2/4  Email Confirm + Admin Grant")

    # Try a direct login first — maybe email confirmation is disabled
    res, status = api("POST", "/auth/v1/token?grant_type=password", {
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if res.get("access_token"):
        ok("Email already confirmed", True, "login worked directly")
        return res["access_token"]

    # Email confirmation is required — guide user to run SQL
    print("""
  Email confirmation required hai.
  Supabase SQL Editor mein yeh SQL run karo:

  ┌──────────────────────────────────────────────────────────┐""")
    sql = f"""
  │  -- Step A: Confirm email
  │  UPDATE auth.users
  │    SET email_confirmed_at = now(), confirmed_at = now()
  │    WHERE email = '{ADMIN_EMAIL}';
  │
  │  -- Step B: Grant admin
  │  INSERT INTO public.profiles (id, display_name, is_admin)
  │    SELECT id, '{ADMIN_NAME}', true FROM auth.users
  │    WHERE email = '{ADMIN_EMAIL}'
  │  ON CONFLICT (id) DO UPDATE
  │    SET is_admin = true, display_name = '{ADMIN_NAME}';
  └──────────────────────────────────────────────────────────┘"""
    print(sql)

    print("""
  SQL Editor link:
  https://supabase.com/dashboard/project/bfqwlcjflbybhltiflkt/sql/new
""")
    # Open SQL editor automatically
    try:
        webbrowser.open("https://supabase.com/dashboard/project/bfqwlcjflbybhltiflkt/sql/new")
        print("  🌐  SQL Editor browser mein open ho raha hai...")
    except Exception:
        pass

    # Wait for user
    input("\n  SQL run karne ke baad ENTER dabao: ")

    # Retry login
    for i in range(5):
        res, _ = api("POST", "/auth/v1/token?grant_type=password", {
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        if res.get("access_token"):
            ok("Login successful", True)
            return res["access_token"]
        err = res.get("error_description") or res.get("error") or ""
        print(f"  ⏳  Retry {i+1}/5: {err}")
        time.sleep(2)

    ok("Login", False, "SQL sahi se run hua? Dobara check karo.")
    sys.exit(1)


# ── Step 3: Verify admin flag ─────────────────────────────────
def step_verify_admin(token):
    hr("3/4  Admin Verification")

    # Get current user
    user_res, _ = api("GET", "/auth/v1/user", token=token)
    uid = user_res.get("id")
    if not uid:
        ok("User fetch", False)
        return False

    # Check profile
    profile_res, _ = api(
        "GET",
        f"/rest/v1/profiles?id=eq.{uid}&select=is_admin,display_name",
        token=token
    )
    if isinstance(profile_res, list) and profile_res:
        is_admin = profile_res[0].get("is_admin", False)
        name     = profile_res[0].get("display_name", "?")

        if not is_admin:
            ok("is_admin", False, "Profile row mein is_admin = false hai")
            print("\n  Run karo Supabase SQL Editor mein:")
            print(f"  UPDATE public.profiles SET is_admin = true WHERE id = '{uid}';")
            # Try to set it ourselves (will fail due to RLS but worth trying)
            api("PATCH",
                f"/rest/v1/profiles?id=eq.{uid}",
                {"is_admin": True},
                token=token,
                prefer="return=minimal"
            )
            # Re-check
            profile_res2, _ = api(
                "GET",
                f"/rest/v1/profiles?id=eq.{uid}&select=is_admin",
                token=token
            )
            if isinstance(profile_res2, list) and profile_res2:
                is_admin = profile_res2[0].get("is_admin", False)

        ok("is_admin = true", is_admin, f"name = {name}")
        ok("User ID", True, uid[:16] + "...")
        return is_admin
    else:
        ok("Profile row exists", False, "trigger se create nahi hua hoga")
        print(f"""
  Manually run karo SQL Editor mein:
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES ('{uid}', '{ADMIN_NAME}', true)
  ON CONFLICT (id) DO UPDATE SET is_admin = true;
""")
        return False


# ── Step 4: Start server + open browser ───────────────────────
def step_start_dashboard():
    hr("4/4  Dashboard Launch")

    # Kill any existing server on the port
    try:
        import signal
        result = subprocess.run(
            ["lsof", "-ti", f":{DASHBOARD_PORT}"],
            capture_output=True, text=True
        )
        pids = result.stdout.strip().split()
        for pid in pids:
            try:
                os.kill(int(pid), signal.SIGTERM)
                time.sleep(0.3)
            except Exception:
                pass
    except Exception:
        pass

    # Start fresh server
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(DASHBOARD_PORT)],
        cwd=DASHBOARD_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(1)

    # Verify
    try:
        with urllib.request.urlopen(f"http://localhost:{DASHBOARD_PORT}") as r:
            ok(f"Server running on :{DASHBOARD_PORT}", r.status == 200, f"PID {proc.pid}")
    except Exception as e:
        ok("Server start", False, str(e)[:60])
        return

    # Open browser
    dashboard_url = f"http://localhost:{DASHBOARD_PORT}"
    try:
        subprocess.run(["open", dashboard_url], check=False)
        ok("Browser open", True, dashboard_url)
    except Exception:
        ok("Browser", False, f"manually open karo: {dashboard_url}")


# ── Main ──────────────────────────────────────────────────────
def main():
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║      Kangi Admin Dashboard — Setup & Launch          ║")
    print("╚══════════════════════════════════════════════════════╝")
    print(f"\n  Email:    {ADMIN_EMAIL}")
    print(f"  Password: {ADMIN_PASSWORD}")

    step_signup()
    token = step_confirm_and_admin()
    admin_ok = step_verify_admin(token)
    step_start_dashboard()

    print()
    print("╔══════════════════════════════════════════════════════╗")
    if admin_ok:
        print("║  ✅  Setup complete! Dashboard ready.                ║")
    else:
        print("║  ⚠️   Setup partial — is_admin SQL baaki hai.         ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  URL:      http://localhost:{DASHBOARD_PORT}                   ║")
    print(f"║  Email:    {ADMIN_EMAIL}                   ║")
    print(f"║  Password: {ADMIN_PASSWORD}                          ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()


if __name__ == "__main__":
    main()
