import { NextResponse } from 'next/server'
import { verifyPassword, newToken, expiresAt, getSql, COOKIE, COOKIE_OPTS } from '@/lib/auth-server'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  const cleanEmail = (email as string)?.trim().toLowerCase()

  if (!cleanEmail || !password) {
    return NextResponse.json({ message: 'Email and password are required.' }, { status: 400 })
  }

  const sql = getSql()
  let rows: { id: string; password_hash: string }[]
  try {
    rows = (await sql`
      SELECT id, password_hash FROM app_users WHERE email = ${cleanEmail}
    `) as { id: string; password_hash: string }[]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('signin db error:', msg)
    return NextResponse.json({ message: `DB error: ${msg}` }, { status: 500 })
  }

  if (!rows.length || !(await verifyPassword(password as string, rows[0].password_hash))) {
    return NextResponse.json({ message: 'Invalid email or password.' }, { status: 401 })
  }

  const token = newToken()
  const exp = expiresAt(30)
  await sql`
    INSERT INTO app_sessions (token, user_id, status, expires_at)
    VALUES (${token}, ${rows[0].id}, 'active', ${exp.toISOString()})
  `

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, COOKIE_OPTS)
  return res
}
