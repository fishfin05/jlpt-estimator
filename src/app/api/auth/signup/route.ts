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
  let existing: { id: string }[]
  try {
    existing = (await sql`SELECT id FROM app_users WHERE email = ${cleanEmail}`) as { id: string }[]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('signup db error:', msg)
    return NextResponse.json({ message: `DB error: ${msg}` }, { status: 500 })
  }
  if (existing.length > 0) {
    return NextResponse.json(
      { message: 'An account with this email already exists. Try signing in instead.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(password as string)
  const [user] = (await sql`
    INSERT INTO app_users (email, password_hash)
    VALUES (${cleanEmail}, ${passwordHash})
    RETURNING id
  `) as { id: string }[]

  const token = newToken()
  const exp = expiresAt(30)
  await sql`
    INSERT INTO app_sessions (token, user_id, status, expires_at)
    VALUES (${token}, ${user.id}, 'active', ${exp.toISOString()})
  `

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, COOKIE_OPTS)
  return res
}
