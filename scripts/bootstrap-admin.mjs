#!/usr/bin/env node

/**
 * Bootstrap an admin user in Supabase Auth + mark profile as admin.
 * For OTP-only auth: creates user with email only (no password). User signs in via verification code.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   ADMIN_EMAIL="metacreatives.genesis@gmail.com" node scripts/bootstrap-admin.mjs
 *
 * Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * After bootstrap, ensure .env.local has:
 *   NEXT_PUBLIC_ADMIN_EMAIL=<same as ADMIN_EMAIL>
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = (process.env.ADMIN_EMAIL || '').trim()

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!email) {
  throw new Error('Missing ADMIN_EMAIL')
}

const supabase = createClient(url, serviceRoleKey)

// Check if user already exists
const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 500 })
const existing = users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
let userId = existing?.id

if (!userId) {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createError) throw createError
  userId = created.user?.id
}

if (!userId) throw new Error('Admin user was not created')

const { error: profileError } = await supabase
  .from('user_profiles')
  .upsert({ id: userId, is_admin: true }, { onConflict: 'id' })

if (profileError) throw profileError

console.log(JSON.stringify({ ok: true, adminEmail: email, adminUserId: userId }, null, 2))
