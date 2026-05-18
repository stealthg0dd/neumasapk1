import type { Metadata } from "next";

import { AuthRedirectIfLoggedIn } from "@/components/auth-redirect";
import { LandingPage } from "@/components/landing/LandingPage";
import { StructuredData } from "@/components/public/StructuredData";
import { buildAbsoluteUrl, getHomepageSchemas, siteConfig } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Neumas — Your Grocery Autopilot",
  description: siteConfig.description,
  keywords: [
    "Neumas",
    "grocery autopilot",
    "pantry intelligence",
    "stockout prediction",
    "smart shopping list",
    "receipt intelligence",
    "Singapore grocery app",
    "Southeast Asia grocery app",
  ],
  alternates: {
    canonical: buildAbsoluteUrl("/"),
  },
  openGraph: {
    title: "Neumas — Your Grocery Autopilot",
    description: siteConfig.description,
    url: buildAbsoluteUrl("/"),
    type: "website",
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImagePath,
        width: 1200,
        height: 630,
        alt: "Neumas grocery autopilot homepage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Neumas — Your Grocery Autopilot",
    description: siteConfig.description,
    images: [siteConfig.ogImagePath],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

/**
 * Public homepage — server component so all content is present in raw HTML
 * for web crawlers, LLM scrapers, and social preview bots.
 *
 * Auth redirect is handled by the lightweight client component below,
 * which re-hydrates on the client and pushes logged-in users to /dashboard
 * without blocking the initial server render.
 */
export default function RootPage() {
  return (
    <>
      <StructuredData data={getHomepageSchemas()} />
      <AuthRedirectIfLoggedIn />
      <h1 className="sr-only">Neumas grocery intelligence and household autopilot</h1>
      <section className="sr-only" aria-label="Neumas public homepage summary">
        <p>
          Neumas is an AI grocery and inventory intelligence platform for households in Singapore
          and Southeast Asia.
        </p>
        <h2>Capture</h2>
        <p>Capture receipts and household grocery purchases with a mobile-first upload flow.</p>
        <h2>Understand</h2>
        <p>Understand pantry state, retailer history, spend, and consumption patterns.</p>
        <h2>Act</h2>
        <p>Act on stockout predictions, smart shopping lists, and practical household recommendations.</p>
        <h2>Frequently Asked Questions</h2>
        <p>
          Public Neumas pages explain the product while authenticated dashboards and household data
          remain private.
        </p>
      </section>
      <LandingPage />
    </>
  );
}
