import { NextResponse } from 'next/server'
import { hashPassword, newToken, expiresAt, getSql, COOKIE, COOKIE_OPTS } from '@/lib/auth-server'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  const cleanEmail = (email as string)?.trim().toLowerCase()

  if (!cleanEmail || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 })
  }
  if ((password as string).length < 6) {
    return NextResponse.json({ message: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  const sql = getSql()
  const existing = await sql`SELECT id FROM app_users WHERE email = ${cleanEmail}`
  if (existing.length > 0) {
    return NextResponse.json(
      { message: 'An account with this email already exists. Try signing in instead.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password as string)
  const [user] = (await sql`
    INSERT INTO app_users (id, email, password_hash, created_at, updated_at)
    VALUES (gen_random_uuid(), ${cleanEmail}, ${passwordHash}, now(), now())
    RETURNING id
  `) as { id: string }[]

  const token = newToken()
  const exp = expiresAt(30)
  await sql`
    INSERT INTO app_sessions (id, user_id, token, status, expires_at, created_at)
    VALUES (gen_random_uuid(), ${user.id}, ${token}, 'active', ${exp.toISOString()}, now())
  `

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, COOKIE_OPTS)
  return res
}
