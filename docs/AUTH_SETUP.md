# Auth Setup Guide

This app uses **email + password** for sign-in and sign-up. No email verification, OTP, or Google login.

## 1. Supabase Dashboard

### Email provider

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Providers**
2. Ensure **Email** is **Enabled**
3. (Optional) Under Email provider you can disable "Confirm email" so new users are active immediately without a confirmation link.

---

## 2. Environment variables

In `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Admin

Admin is determined by `user_profiles.is_admin` in the database (set via bootstrap or migrate scripts). No special env needed for login; use the same email + password flow.

```env
NEXT_PUBLIC_ADMIN_EMAIL=metacreatives.genesis@gmail.com
```

---

## 3. Flows

### Sign in

1. Enter email and password → **Sign in**

### Sign up

1. Click **Sign up instead** → enter email and password (min 6 characters) → **Sign up**
2. Account is created and you are signed in.

---

## 4. Scripts

- **Bootstrap admin (email-only, no password):** `ADMIN_EMAIL=... node scripts/bootstrap-admin.mjs`
- **Migrate admin to another email:** `OLD_ADMIN_EMAIL=... NEW_ADMIN_EMAIL=... node scripts/migrate-admin.mjs`
