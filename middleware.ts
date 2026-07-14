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
  "/api/trial-reminders",
  "/_next",
  "/robots.txt",
  "/sitemap.xml",
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

  // --- Billing gate ---------------------------------------------------------
  // A working login is NOT enough to use the app: the org must have a live
  // Stripe subscription (or a deliberate manual grant). Without this, an
  // abandoned Stripe checkout leaves a fully-working account with no billing —
  // exactly what happened to the two "Dynamic Food Safety" signups.
  //
  // A live Stripe subscription is required. `trialing`/`active`/`past_due` are set
  // by Stripe (webhook / checkout confirm). NOTE: the DB *default* is `trial`
  // (never paid) and is intentionally NOT here — don't confuse it with `trialing`.
  const BILLING_OK = new Set(["trialing", "active", "past_due"]);
  // The ONLY accounts with free access: the owner (Popped/demo) and Beacon's
  // referral partner. Everyone else — including paying customers — must have a
  // Stripe subscription. Free access is by exact login email, not by org status.
  const FREE_ACCESS_EMAILS = new Set([
    "support@kernelapp.co.uk",
    "katie@beacon-compliance.co.uk",
  ]);

  const gateExempt =
    pathname.startsWith("/api/") ||             // API routes self-authenticate; never 302 a fetch
    pathname.startsWith("/account/billing") ||  // the page they pay / recover checkout on
    FREE_ACCESS_EMAILS.has((user.email ?? "").toLowerCase());

  if (!gateExempt) {
    const { data: member } = await supabase
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", user.id)
      .single();

    let allowed = false;
    if (member?.organisation_id) {
      const { data: org } = await supabase
        .from("organisations")
        .select("subscription_status")
        .eq("id", member.organisation_id)
        .single();
      allowed = !!org && BILLING_OK.has(org.subscription_status ?? "");
    }

    if (!allowed) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/account/billing";
      redirectUrl.searchParams.set("setup", "1");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
