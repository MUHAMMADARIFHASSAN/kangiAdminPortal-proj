#!/usr/bin/env python3
"""
backfill_emails.py — one-time script, run on your own computer.

Makes every user's email visible in the admin dashboard's Users tab,
without SQL and without deploying anything.

Emails live in Supabase Auth, which the dashboard (a browser) cannot read.
The Unity app stores each player's email in a hidden support_messages row
(body "__kangi_email__:<email>") after login; only the player and admins can
read support_messages. This script writes that same row for every existing
user at once, so the dashboard shows all emails immediately.

The service_role key is read from an environment variable and only sent to
Supabase. Never paste it into the code, the dashboard or the app.

Usage (from the kangiAdminPortal-proj folder):
    export SUPABASE_SERVICE_ROLE_KEY='<Dashboard → Settings → API → service_role>'
    python3 tools/backfill_emails.py --dry-run     # only counts, writes nothing
    python3 tools/backfill_emails.py               # writes the rows
Safe to run again: users who already have their current email stored are skipped.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

SUPABASE_URL = "https://bfqwlcjflbybhltiflkt.supabase.co"
EMAIL_MARKER = "__kangi_email__:"
PER_PAGE = 1000


def request(method, path, key, body=None, params=None):
    url = SUPABASE_URL + path
    if params:
        url += "?" + urllib.parse.urlencode(params, safe="*,.()")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        "x-product-id": "kangi-admin",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: HTTP {e.code} {e.read().decode()[:300]}")


def main():
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        sys.exit("Set SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).")
    dry_run = "--dry-run" in sys.argv

    # 1. All users from Supabase Auth.
    users, page = [], 1
    while True:
        res = request("GET", "/auth/v1/admin/users", key,
                      params={"page": page, "per_page": PER_PAGE})
        batch = res.get("users", []) if isinstance(res, dict) else []
        users += batch
        if len(batch) < PER_PAGE:
            break
        page += 1

    # 2. Emails already stored (newest row per user wins).
    stored = {}
    rows = request("GET", "/rest/v1/support_messages", key, params={
        "body": "like." + EMAIL_MARKER + "*",
        "select": "user_id,body",
        "order": "created_at.desc",
    }) or []
    for r in rows:
        stored.setdefault(r["user_id"], r["body"])

    # 3. Display names, so the hidden row looks like the app's.
    names = {}
    for p in request("GET", "/rest/v1/profiles", key,
                     params={"select": "id,display_name"}) or []:
        names[p["id"]] = p.get("display_name") or ""

    # 4. Rows still missing or out of date.
    to_insert = []
    for u in users:
        email = (u.get("email") or "").strip().lower()
        if not email:
            continue
        marker = EMAIL_MARKER + email
        if stored.get(u["id"]) == marker:
            continue
        to_insert.append({
            "user_id": u["id"],
            "display_name": names.get(u["id"], ""),
            "body": marker,
            "status": "replied",   # never counted as an open message
        })

    print(f"Users in Auth: {len(users)}")
    print(f"Already stored: {len(users) - len(to_insert)}")
    print(f"To write: {len(to_insert)}")
    if dry_run or not to_insert:
        print("Dry run — nothing written." if dry_run else "Nothing to do.")
        return

    for i in range(0, len(to_insert), 500):
        request("POST", "/rest/v1/support_messages", key, body=to_insert[i:i + 500])
    print(f"Done. Wrote {len(to_insert)} rows. Refresh the dashboard's Users tab.")


if __name__ == "__main__":
    main()
