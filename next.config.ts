import type { NextConfig } from "next";

// Old → new URL redirects after the route restructure (June 2026). Keeps
// existing bookmarks, emailed links and printed QR codes working. Permanent
// (308) so browsers/search engines update. Note: old "/dashboard" (the former
// Checklist Submissions list) is NOT redirected because that path is now the
// main dashboard; it lived at "/home" before.
const ROUTE_MOVES: [string, string][] = [
  ["/home", "/dashboard"],
  ["/admin/finished-goods", "/production/finished-goods"],
  ["/admin/goods-in", "/production/goods-in"],
  ["/admin/goods-out", "/production/goods-out"],
  ["/admin/stock", "/compliance/raw-materials"],
  ["/admin/sops", "/compliance/sops"],
  ["/admin/suppliers", "/compliance/suppliers"],
  ["/admin/traceability", "/compliance/traceability"],
  ["/admin/team/training", "/compliance/training"],
  ["/admin/team/staff", "/admin/staff"],
  ["/admin/production-builder", "/admin/production-flow"],
  ["/print-qr", "/admin/print-qr"],
  ["/admin/billing", "/account/billing"],
  ["/admin/users", "/account/users"],
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dudchdacsrgdnenkqmyo.supabase.co",
      },
    ],
  },
  async redirects() {
    return ROUTE_MOVES.flatMap(([from, to]) => [
      // exact path
      { source: from, destination: to, permanent: true },
      // any nested path (e.g. /admin/sops/123 → /compliance/sops/123)
      { source: `${from}/:path*`, destination: `${to}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
