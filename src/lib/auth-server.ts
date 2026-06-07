import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { neon } from '@neondatabase/serverless'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

const scryptAsync = promisify(scrypt)

export const COOKIE = 'jlpt_session'
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== 'development',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
}

export function getSql() {
  return neon(process.env.DATABASE_URL!)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = (await scryptAsync(password, salt, 64)) as Buffer
  return `${buf.toString('hex')}.${salt}`
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [hashed, salt] = hash.split('.')
    const buf = (await scryptAsync(password, salt, 64)) as Buffer
    return timingSafeEqual(buf, Buffer.from(hashed, 'hex'))
  } catch {
    return false
  }
}

export function newToken(): string {
  return randomBytes(32).toString('hex')
}

export function expiresAt(days = 30): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export interface SessionUser {
  id: string
  email: string
}

async function getUserByToken(token: string): Promise<SessionUser | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT u.id, u.email
    FROM app_sessions s JOIN app_users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.status = 'active' AND s.expires_at > now()
  `) as SessionUser[]
  return rows[0] ?? null
}

// For API routes
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE)?.value
  if (!token) return null
  return getUserByToken(token)
}

// For server components and server actions
export async function getUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE)?.value
  if (!token) return null
  return getUserByToken(token)
}
