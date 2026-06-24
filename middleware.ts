import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/auth/",
  "/api/auth",
  "/api/submit",
  "/api/signup",
  "/api/stripe-webhook",
  "/api/reminders",
  "/_next",
  "/privacy",
  "/terms",
  "/saq/",
  "/c/",
  "/accept-invite",
  "/api/accept-invite",
];

// Static assets (images, fonts, icons) are always public — never gate them.
const PUBLIC_FILE = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    PUBLIC_FILE.test(pathname) ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
