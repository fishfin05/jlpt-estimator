import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request and guards
 * protected routes. Called from the root middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  const { searchParams, pathname } = request.nextUrl;

  // Auth-link fallback: Supabase may deliver the `?code=` (or an error) to the
  // Site URL (e.g. "/") instead of /auth/callback when the exact callback URL
  // isn't allowlisted. Catch it anywhere and route it to the callback handler.
  if (pathname !== "/auth/callback") {
    if (searchParams.has("code")) {
      const url = request.nextUrl.clone();
      const code = searchParams.get("code")!;
      url.pathname = "/auth/callback";
      url.search = "";
      url.searchParams.set("code", code);
      url.searchParams.set("next", searchParams.get("next") || "/");
      return NextResponse.redirect(url);
    }
    if (searchParams.has("error") && pathname !== "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", searchParams.get("error_description") || searchParams.get("error")!);
      return NextResponse.redirect(url);
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Routes that require a logged-in user. /quiz is intentionally public so
  // anyone can try the quiz without an account (they're prompted to sign in
  // afterward to save their results).
  const protectedPrefixes = ["/dashboard"];
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (isProtected && !user) {
    const nextTarget = pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", nextTarget);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
