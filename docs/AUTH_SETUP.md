# Auth Setup Guide

This app uses **email + 8-digit verification code** for sign-in. Everyone (including admin) uses the same OTP flow.

## 1. Supabase Dashboard

### Email provider

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers**
2. Ensure **Email** is **Enabled**

### Use 8-digit code (not magic link)

1. Go to **Authentication** → **Email Templates**
2. Open the **Magic Link** template
3. Replace the body so the code is shown:

```html
<h2>Your verification code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
<p>This code expires in 1 hour.</p>
```

---

## 2. Environment variables

In `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Admin email

Admin is identified by `NEXT_PUBLIC_ADMIN_EMAIL` (e.g. `metacreatives.genesis@gmail.com`). This user gets `is_admin=true` in `user_profiles` and sees all creatives. Admin signs in with OTP like everyone else.

```env
NEXT_PUBLIC_ADMIN_EMAIL=metacreatives.genesis@gmail.com
```

To make an existing user the admin after they sign up, run:

```bash
OLD_ADMIN_EMAIL=admin@genesis.local NEW_ADMIN_EMAIL=metacreatives.genesis@gmail.com node scripts/migrate-admin.mjs
```

This transfers business ownership and sets `is_admin` for the new admin.

---

## 3. Flows

### All users (including admin) – verification code

1. Enter email → **Send verification code**
2. Enter the 8-digit code from the email → **Verify** → signed in

---

## 4. Email rate limits

If you hit "rate limit exceeded" when sending OTP codes:

1. **Soften limits** – Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Rate Limits**
   - **OTP**: Increase "OTP per hour" (default 360) if needed
   - **Request interval**: Reduce "Minimum interval between OTP requests" (default 60 seconds) to allow more frequent attempts
2. **Custom SMTP** – For production, set up custom SMTP (Dashboard → Auth → SMTP) to get higher email limits.
