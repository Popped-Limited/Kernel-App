import type { MetadataRoute } from "next";

// Public marketing pages are indexable; the authenticated multi-tenant app
// (and everything that exposes per-org data) is kept out of Google.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/production/",
        "/compliance/",
        "/admin/",
        "/account/",
        "/auth/",
        "/login",
        "/accept-invite",
        "/submission/",
        "/checklist/",
        "/sop/",
        "/saq/",
        "/c/",
      ],
    },
    sitemap: "https://kernelapp.co.uk/sitemap.xml",
  };
}
