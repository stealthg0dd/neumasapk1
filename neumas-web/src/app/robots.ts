import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, siteConfig } from "@/lib/public-site";

const privatePaths = [
  "/app",
  "/dashboard",
  "/admin",
  "/api/auth",
  "/api/internal",
  "/account",
  "/settings",
];

const crawlableAgents = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "GPTBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Applebot",
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    host: siteConfig.url,
    sitemap: buildAbsoluteUrl("/sitemap.xml"),
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      ...crawlableAgents.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: privatePaths,
      })),
    ],
  };
}