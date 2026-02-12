# Auth Setup Guide

This app uses **email + 8-digit verification code** for sign-in. Admins use a synthetic email with password (no OTP).

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

### Admin synthetic email

Admin account: `admin@genesis.local` (password set via bootstrap). No OTP is sent for this email.

1. Ensure `.env.local` has:
   ```env
   NEXT_PUBLIC_ADMIN_EMAIL=admin@genesis.local
   ```

2. On the login page, enter `admin@genesis.local` → click **Send verification code** → a **password field** appears instead (no email sent). Enter password → sign in.

This bypasses email rate limits entirely for the admin.

---

## 3. Flows

### Regular users (verification code)

1. Enter email → **Send verification code**
2. Enter the 8-digit code from the email → **Verify** → signed in

### Admin (synthetic email + password)

1. Enter admin email (`admin@genesis.local`)
2. Click **Send verification code** → password field appears (no code sent)
3. Enter password → **Sign in** → signed in

---

## 4. Email rate limits

If you hit "rate limit exceeded" when sending OTP codes:

1. **Admin login** – Use `admin@genesis.local` + password; no email is sent, so no rate limit.
2. **Soften limits** – Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Rate Limits**
   - **OTP**: Increase "OTP per hour" (default 360) if needed
   - **Request interval**: Reduce "Minimum interval between OTP requests" (default 60 seconds) to allow more frequent attempts
3. **Custom SMTP** – For production, set up custom SMTP (Dashboard → Auth → SMTP) to get higher email limits.
