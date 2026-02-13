#!/usr/bin/env node

/**
 * Bootstrap an admin user in Supabase Auth + mark profile as admin.
 * Use email + password to sign in on the app.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="YourPassword123" node scripts/bootstrap-admin.mjs
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
const password = (process.env.ADMIN_PASSWORD || '').trim()

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!email) {
  throw new Error('Missing ADMIN_EMAIL')
}

const supabase = createClient(url, serviceRoleKey)

const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 500 })
const existing = users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
let userId = existing?.id

if (!userId) {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: password || undefined,
    email_confirm: true,
  })
  if (createError) throw createError
  userId = created.user?.id
} else if (password) {
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password,
  })
  if (updateError) throw updateError
}

if (!userId) throw new Error('Admin user was not created')

const { error: profileError } = await supabase
  .from('user_profiles')
  .upsert({ id: userId, is_admin: true }, { onConflict: 'id' })

if (profileError) throw profileError

console.log(JSON.stringify({ ok: true, adminEmail: email, adminUserId: userId }, null, 2))
