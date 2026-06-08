// One-time script to reset your password in the Neon database.
// Run with: node --env-file=.env.local reset-password.mjs

import { scrypt, randomBytes } from 'crypto'
import { promisify } from 'util'
import { neon } from '@neondatabase/serverless'

const scryptAsync = promisify(scrypt)

const EMAIL    = process.env.USER_EMAIL || 'fmcrainer@gmail.com'
const PASSWORD = process.env.NEW_PASSWORD || 'changeme123'
const sql      = neon(process.env.DATABASE_URL)

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf  = await scryptAsync(password, salt, 64)
  return `${buf.toString('hex')}.${salt}`
}

const hash = await hashPassword(PASSWORD)
const rows = await sql`
  UPDATE app_users SET password_hash = ${hash}
  WHERE email = ${EMAIL}
  RETURNING id, email
`

if (!rows.length) {
  console.error(`No user found with email ${EMAIL}`)
  process.exit(1)
}

console.log(`Password reset for ${rows[0].email} (id: ${rows[0].id})`)
console.log(`You can now sign in with: ${EMAIL} / ${PASSWORD}`)
