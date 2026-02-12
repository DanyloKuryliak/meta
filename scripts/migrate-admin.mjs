#!/usr/bin/env node

/**
 * Migrate admin from old email to new email.
 * Transfers ownership of businesses and brands, and sets is_admin for the new admin.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   OLD_ADMIN_EMAIL=admin@genesis.local NEW_ADMIN_EMAIL=metacreatives.genesis@gmail.com node scripts/migrate-admin.mjs
 *
 * Prerequisites:
 * - NEW_ADMIN_EMAIL must already exist in auth.users (sign up via OTP first on the login page).
 *
 * Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const oldEmail = (process.env.OLD_ADMIN_EMAIL || '').trim().toLowerCase()
const newEmail = (process.env.NEW_ADMIN_EMAIL || '').trim().toLowerCase()

if (!url || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!oldEmail || !newEmail || oldEmail === newEmail) {
  throw new Error('Provide OLD_ADMIN_EMAIL and NEW_ADMIN_EMAIL (must differ)')
}

const supabase = createClient(url, serviceRoleKey)

const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 500 })
const oldAdmin = users?.find((u) => (u.email || '').toLowerCase() === oldEmail)
const newAdmin = users?.find((u) => (u.email || '').toLowerCase() === newEmail)

if (!newAdmin) {
  throw new Error(
    `New admin "${newEmail}" not found in auth.users. Sign up via OTP on the login page first.`
  )
}

const oldId = oldAdmin?.id || null
const newId = newAdmin.id

let bizUpdated = 0
let brandUpdated = 0

if (oldId) {
  // Transfer businesses ownership
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, user_id')
    .eq('user_id', oldId)

  if (businesses?.length) {
    const { error } = await supabase
      .from('businesses')
      .update({ user_id: newId })
      .eq('user_id', oldId)
    if (error) throw error
    bizUpdated = businesses.length
  }

  // Transfer brands ownership
  const { data: brands } = await supabase
    .from('brands')
    .select('id, user_id')
    .eq('user_id', oldId)

  if (brands?.length) {
    const { error } = await supabase
      .from('brands')
      .update({ user_id: newId })
      .eq('user_id', oldId)
    if (error) throw error
    brandUpdated = brands.length
  }
}

// Set new admin as admin, demote old admin
const { error: profileErr } = await supabase
  .from('user_profiles')
  .upsert({ id: newId, is_admin: true }, { onConflict: 'id' })
if (profileErr) throw profileErr

if (oldId) {
  await supabase
    .from('user_profiles')
    .update({ is_admin: false })
    .eq('id', oldId)
}

console.log(
  JSON.stringify(
    {
      ok: true,
      newAdminEmail: newEmail,
      newAdminUserId: newId,
      oldAdminUserId: oldId,
      businessesTransferred: bizUpdated,
      brandsTransferred: brandUpdated,
    },
    null,
    2
  )
)
