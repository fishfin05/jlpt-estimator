import { NextResponse } from 'next/server'
import { verifyPassword, newToken, expiresAt, getSql, COOKIE, COOKIE_OPTS } from '@/lib/auth-server'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  const cleanEmail = (email as string)?.trim().toLowerCase()

  if (!cleanEmail || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 })
  }

  const sql = getSql()
  const rows = (await sql`
    SELECT id, password_hash FROM app_users WHERE email = ${cleanEmail}
  `) as { id: string; password_hash: string }[]

  if (!rows.length || !(await verifyPassword(password as string, rows[0].password_hash))) {
    return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 })
  }

  const token = newToken()
  const exp = expiresAt(30)
  await sql`
    INSERT INTO app_sessions (id, user_id, token, status, expires_at, created_at)
    VALUES (gen_random_uuid(), ${rows[0].id}, ${token}, 'active', ${exp.toISOString()}, now())
  `

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, COOKIE_OPTS)
  return res
}
