#!/usr/bin/env node

/**
 * Bootstrap an admin user in Supabase Auth + mark profile as admin.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword" node scripts/bootstrap-admin.mjs
 *
 * Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const email = (process.env.ADMIN_EMAIL || '').trim()
const password = process.env.ADMIN_PASSWORD || ''

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!email || !password) {
  throw new Error('Missing ADMIN_EMAIL or ADMIN_PASSWORD')
}

const supabase = createClient(url, serviceRoleKey)

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})

if (createError) throw createError

const userId = created.user?.id
if (!userId) throw new Error('Admin user was not created')

const { error: profileError } = await supabase
  .from('user_profiles')
  .upsert({ id: userId, is_admin: true }, { onConflict: 'id' })

if (profileError) throw profileError

console.log(JSON.stringify({ ok: true, adminEmail: email, adminUserId: userId }, null, 2))

