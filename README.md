# Meta Ads Dashboard

Competitor ad intelligence dashboard for Meta Ads Library. View creatives, funnel summaries, and brand analytics.

## Tech stack

- **Next.js 16** (App Router)
- **Supabase** (auth, database, Edge Functions)
- **Apify** (Facebook Ads Library scraper)
- **Vercel** (hosting)

## Project structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes (edge proxies to Supabase)
│   ├── auth/              # Auth pages (login, callback, reset)
│   └── ...
├── components/
│   ├── auth/              # Auth forms, provider
│   ├── dashboard/         # Dashboard tabs, forms, management
│   └── ui/                # Reusable UI components
├── lib/                   # Supabase clients, utils
├── hooks/                 # React hooks
├── scripts/               # Admin bootstrap, auth scripts
├── supabase/
│   └── functions/         # Edge Functions (ingest_from_url)
└── docs/                  # AUTH_SETUP, DEPLOYMENT
```

## Getting started

### 1. Clone and install

```bash
git clone <repo-url>
cd meta-ads-dashboard
npm install
```

### 2. Environment

Copy `env.example` to `.env.local` and fill in values:

```bash
cp env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL` – Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` – Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` – For admin scripts and API
- `APIFY_TOKEN` – For Add Competitor (Apify actor)
- `NEXT_PUBLIC_ADMIN_EMAIL` – Email that receives admin rights

### 3. Run locally

```bash
npm run dev
```

### 4. Bootstrap admin

After first sign-up, grant admin to a user:

```bash
ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=YourPassword node scripts/bootstrap-admin.mjs
```

See `docs/AUTH_SETUP.md` for auth setup and `docs/DEPLOYMENT.md` for production deployment.

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/bootstrap-admin.mjs` | Grant admin to a user by email |
| `scripts/migrate-admin.mjs` | Migrate admin from one email to another |
| `scripts/reset-auth.mjs` | Reset password for admin user |

## License

Private.
