import type { MetadataRoute } from "next";

import { publicConfig } from "@/lib/config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://neumasfinal.vercel.app";

  const staticPages = ["", "/insights", "/onboard"].map((path) => ({
    url: baseUrl + path,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1.0 : 0.7,
  }));

  let insightPages: MetadataRoute.Sitemap = [];
  try {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ??
      process.env.NEXT_PUBLIC_BACKEND_URL ??
      publicConfig.apiUrl;
    const res = await fetch(`${apiBase}/api/insights/posts?limit=50`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { posts?: { slug: string; created_at: string }[] };
      const posts = data.posts ?? [];
      insightPages = posts.map((p) => ({
        url: `${baseUrl}/insights/${p.slug}`,
        lastModified: new Date(p.created_at),
        changeFrequency: "never" as const,
        priority: 0.6,
      }));
    }
  } catch {
    /* insights API optional at build time */
  }

  return [...staticPages, ...insightPages];
}
