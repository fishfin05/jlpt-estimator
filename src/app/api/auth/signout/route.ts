import { NextResponse, type NextRequest } from 'next/server'
import { getSql, COOKIE } from '@/lib/auth-server'

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value
  if (token) {
    const sql = getSql()
    await sql`DELETE FROM app_sessions WHERE token = ${token}`
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
