import type { MetadataRoute } from "next";

import { BACKEND_URL } from "@/lib/backend-url";
import { buildAbsoluteUrl, publicPages } from "@/lib/public-site";

type InsightPost = {
  slug: string;
  created_at: string;
};

function getChangeFrequency(path: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  return path.startsWith("/research/") ? "monthly" : "weekly";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicEntries: MetadataRoute.Sitemap = [
    {
      url: buildAbsoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: buildAbsoluteUrl("/insights"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...publicPages.map((page) => ({
      url: buildAbsoluteUrl(page.path),
      lastModified: new Date(),
      changeFrequency: getChangeFrequency(page.path),
      priority: page.path.startsWith("/features/") || page.path.startsWith("/use-cases/") ? 0.8 : 0.7,
    })),
  ];

  let insightPages: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/insights/posts?limit=50`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { posts?: InsightPost[] };
      insightPages = (data.posts ?? []).map((post) => ({
        url: buildAbsoluteUrl(`/insights/${post.slug}`),
        lastModified: new Date(post.created_at),
        changeFrequency: "monthly",
        priority: 0.6,
      }));
    }
  } catch {
    /* insights API optional at build time */
  }

  return [...publicEntries, ...insightPages];
}
