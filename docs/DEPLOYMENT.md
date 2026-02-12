# Production Deployment Checklist

## Supabase (Meta project)

**Project:** Meta | **ID:** `ykiigbgdtdfeknnxwbfi` | **URL:** https://ykiigbgdtdfeknnxwbfi.supabase.co

### Auth → URL Configuration

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → **Meta** project → **Authentication** → **URL Configuration**
2. **Site URL:** Set to your production domain, e.g.  
   `https://meta-ads-dashboard-danylos-projects-d91d45ab.vercel.app`
3. **Redirect URLs** – ensure these are added:
   - `https://meta-ads-dashboard-danylos-projects-d91d45ab.vercel.app/auth/callback`
   - `https://meta-ads-dashboard-danylos-projects-d91d45ab.vercel.app/auth/confirm`
   - `https://meta-ads-dashboard-danylos-projects-d91d45ab.vercel.app/auth/reset-password`

---

## Vercel

**Project:** meta-ads-dashboard  
**Production URL:** https://meta-ads-dashboard-danylos-projects-d91d45ab.vercel.app

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

---

## Quick check

1. **Supabase** – Add/verify production redirect URLs above
2. **Vercel** – Env vars are set; deploy with push or `vercel deploy --prod`
3. **Admin login** – Use `metacreatives.genesis@gmail.com` + 8-digit OTP (same flow as everyone)
4. **Regular users** – Use email + 8-digit verification code
