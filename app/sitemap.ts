import type { MetadataRoute } from "next";

// Only the public-facing marketing/legal pages belong in the sitemap. The
// authenticated app is disallowed in robots.ts and intentionally omitted.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://kernelapp.co.uk";
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/signup`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
