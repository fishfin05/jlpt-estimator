'use server'

// Auth is handled by /api/auth/signup and /api/auth/signin routes.
// This file is kept as a stub so any old imports don't break at build time.

export type AuthResult = { ok: true } | { ok: false; error: string }
