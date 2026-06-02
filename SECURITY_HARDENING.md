# Security Hardening Checklist

This project is a public web app. Full scraping prevention is not possible, but this checklist reduces abuse and bulk copying.

## 1) Cloudflare (edge protection)

- Put your domain behind Cloudflare proxy.
- Enable `WAF Managed Rules`.
- Enable `Super Bot Fight Mode`.
- Add rate limits:
  - `*/rest/v1/*`: 60 requests/min per IP -> Managed Challenge.
  - `*/auth/v1/*`: 20 requests/min per IP -> Block.
  - `*/storage/v1/*`: 60 requests/min per IP -> Managed Challenge.
- Add a rule to challenge known bad bot user agents and empty user agents.
- Add country/ASN blocks if traffic profile allows it.

## 2) Supabase (data access hardening)

- Apply `supabase/schema.sql` with the new hardened policy overrides at the end.
- Ensure RLS is enabled on all public tables.
- Keep `anon` key in frontend, never ship `service_role` key.
- Set API row limits in Supabase project settings.
- Prefer RPCs that return limited data (top-N leaderboards) over broad table reads.

## 3) Frontend exposure reduction

- Avoid shipping full business-critical datasets in `public/`.
- This repository moved crossword dictionary away from `public/` to bundled source to remove direct static download.
- Keep dynamic/value-bearing logic server-side whenever possible.

## 4) Monitoring and response

- Watch Cloudflare analytics for spikes in request rate and bot score.
- Watch Supabase logs for repeated high-volume reads on the same tables.
- Add temporary WAF blocks/challenges when abuse appears.

## 5) Reality check

- Any data sent to a browser can be extracted.
- Goal is to increase attacker effort and reduce automated mass scraping.
