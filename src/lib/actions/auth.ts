"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * Sign up WITHOUT email confirmation.
 *
 * Supabase's built-in confirmation email is unreliable, so instead of asking
 * the user to click a link, we create the account already-confirmed using the
 * service-role key, then immediately sign them in (setting the session cookie).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set in the environment (locally in
 * .env.local, and in the Vercel project's Environment Variables for production).
 */
export async function signUpAction(
  email: string,
  password: string,
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { ok: false, error: "Email and password are required." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const admin = createServiceClient();

  // Create the account with email already confirmed.
  const { error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
  });

  if (createErr) {
    // If the account already exists, that's fine — we'll just try to sign in
    // below. Surface anything else as an error.
    const msg = createErr.message.toLowerCase();
    const alreadyExists =
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists");
    if (!alreadyExists) {
      return { ok: false, error: createErr.message };
    }
  }

  // Now sign in through the cookie-based client so the session is stored.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (signInErr) {
    // Account exists but the password didn't match (created earlier with a
    // different password).
    return {
      ok: false,
      error:
        "An account with this email already exists. Try signing in instead, " +
        "or use a different email.",
    };
  }

  return { ok: true };
}
