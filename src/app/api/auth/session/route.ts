import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request)
  return NextResponse.json({ user: user ?? null })
}
