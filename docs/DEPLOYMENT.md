# Production Deployment Checklist

## Supabase

**Project ID:** your-project-id | **URL:** https://your-project-id.supabase.co

### Auth → URL Configuration

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL Configuration**
2. **Site URL:** Set to your production domain, e.g.  
   `https://your-app.vercel.app`
3. **Redirect URLs** – ensure these are added:
   - `https://your-app.vercel.app/auth/callback`
   - `https://your-app.vercel.app/auth/confirm`
   - `https://your-app.vercel.app/auth/reset-password`

### Edge Functions – Add Competitor (ingest_from_url)

The "Add Competitor" flow calls the `ingest_from_url` Edge Function. The Next.js API verifies the user, then invokes the function with the **service role key** and `user_id` in the body. JWT verification is **disabled** so no user token is needed.

**To fix "Invalid JWT" or "Unauthorized":** Redeploy the function with JWT verification disabled:

```bash
cd /path/to/meta-ads-dashboard
supabase functions deploy ingest_from_url --no-verify-jwt
```

Source: `supabase/functions/ingest_from_url/index.ts`. Ensure `APIFY_TOKEN` is set in Supabase Edge Function secrets.

---

## Vercel

**Project:** meta-ads-dashboard  
**Production URL:** https://your-app.vercel.app

### Environment variables (already configured)

| Variable | Status |
|----------|--------|
| NEXT_PUBLIC_SUPABASE_URL | ✓ |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✓ |
| NEXT_PUBLIC_ADMIN_EMAIL | ✓ |
| SUPABASE_SERVICE_ROLE_KEY | ✓ |

### Deploy

```bash
git add .
git commit -m "Deploy"
git push origin main
```

Or:

```bash
vercel deploy --prod
```

### Production vs local Docker

The meta-ads-dashboard runs on **Vercel** (Next.js). Docker (e.g. n8n) runs separately and does not affect the dashboard. Add Competitor, funnel summary, and all app features work in production as long as:

- Supabase Edge Function `ingest_from_url` is deployed with `--no-verify-jwt`
- `APIFY_TOKEN` is set in Supabase Function secrets
- `populate_summaries` is deployed if you use funnel/creative summaries

---

## Quick check

1. **Supabase** – Add/verify production redirect URLs above
2. **Vercel** – Env vars are set; deploy with push or `vercel deploy --prod`
3. **Admin login** – Same as others: email + password (admin flag is in database)
4. **Regular users** – Use email + 8-digit verification code
