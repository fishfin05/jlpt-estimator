#!/usr/bin/env node
/**
 * create-user.mjs — create (or reset) an account directly, no email needed.
 *
 * Uses the service-role key to create a user with email already confirmed,
 * bypassing Supabase's unreliable built-in email entirely. If the user
 * already exists, its password is reset and email marked confirmed.
 *
 * Usage:
 *   node scripts/create-user.mjs you@example.com yourPassword
 *
 * Afterwards, sign in at /login with that email + password.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/create-user.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 6) {
  console.error("Password must be at least 6 characters.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function findUserByEmail(targetEmail) {
  // listUsers is paginated; scan a few pages.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === targetEmail.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  console.log(`Creating account for ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) {
    console.log("\n✓ Account created and confirmed.");
    console.log(`  Sign in at /login with:\n    email:    ${email}\n    password: (the one you just set)`);
    return;
  }

  // Likely already exists — reset password + confirm instead.
  console.log("User may already exist; updating password and confirming email...");
  const existing = await findUserByEmail(email);
  if (!existing) {
    throw new Error(`createUser failed and no existing user found: ${error.message}`);
  }
  const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updErr) throw new Error(updErr.message);

  console.log("\n✓ Existing account updated (password reset, email confirmed).");
  console.log(`  Sign in at /login with:\n    email:    ${email}\n    password: (the one you just set)`);
}

main().catch((e) => {
  console.error("\nFailed:", e.message);
  process.exit(1);
});
