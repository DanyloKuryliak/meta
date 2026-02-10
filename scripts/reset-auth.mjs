#!/usr/bin/env node

/**
 * RESET AUTH USERS (DESTRUCTIVE)
 *
 * What it does:
 * - Creates/ensures an admin user (confirmed) using ADMIN_EMAIL/ADMIN_PASSWORD
 * - Marks admin as `public.user_profiles.is_admin = true`
 * - Deletes all other Supabase Auth users
 * - Deletes all other `public.user_profiles` rows
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="YourStrongPassword" node scripts/reset-auth.mjs
 *
 * Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminEmail = (process.env.ADMIN_EMAIL || '').trim()
const adminPassword = process.env.ADMIN_PASSWORD || ''

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!adminEmail || !adminPassword) {
  throw new Error('Missing ADMIN_EMAIL or ADMIN_PASSWORD')
}

const supabase = createClient(url, serviceRoleKey)

async function ensureAdmin(allUsers) {
  // supabase-js doesn't expose getUserByEmail in all versions; search via listUsers.
  const existing = allUsers.find((u) => (u.email || '').toLowerCase() === adminEmail.toLowerCase())

  let userId = existing?.id
  if (!userId) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    })
    if (createError) throw createError
    userId = created.user?.id
  }

  if (!userId) throw new Error('Failed to create or resolve admin user')

  // Ensure confirmed + set password (idempotent)
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    email_confirm: true,
    password: adminPassword,
  })
  if (updateError) throw updateError

  if (!userId) throw new Error('Failed to create or resolve admin user')

  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, is_admin: true }, { onConflict: 'id' })

  if (profileError) throw profileError

  return userId
}

async function listAllUsers() {
  const users = []
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...(data.users || []))
    if (!data.users || data.users.length < perPage) break
    page += 1
  }
  return users
}

// Get current users, ensure admin exists, then re-fetch for accurate deletion/summary
await ensureAdmin(await listAllUsers())
const users = await listAllUsers()
const admin = users.find((u) => (u.email || '').toLowerCase() === adminEmail.toLowerCase())
const adminUserId = admin?.id

if (!adminUserId) {
  throw new Error('Admin user not found after creation')
}

const toDelete = users.filter((u) => u.id !== adminUserId)

for (const u of toDelete) {
  const { error } = await supabase.auth.admin.deleteUser(u.id)
  if (error) throw error
}

// Clean user_profiles for deleted users
const deletedIds = toDelete.map((u) => u.id)
if (deletedIds.length) {
  const { error } = await supabase.from('user_profiles').delete().in('id', deletedIds)
  if (error) throw error
}

console.log(
  JSON.stringify(
    {
      ok: true,
      adminEmail,
      adminUserId,
      deletedUsers: toDelete.length,
      remainingUsers: users.length - toDelete.length,
    },
    null,
    2
  )
)

