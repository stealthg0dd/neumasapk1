import type { Metadata } from "next";

import { getCanonicalAppUrl } from "@/lib/app-url";
import { prompt89Pages } from "@/lib/public-content";

export type PublicLink = {
  href: string;
  label: string;
};

export type PublicSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type PublicFaq = {
  question: string;
  answer: string;
};

export type PublicPageContent = {
  path: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  intro: string;
  keywords: string[];
  sections: PublicSection[];
  faq?: PublicFaq[];
  ctaTitle?: string;
  ctaBody?: string;
  relatedLinks: PublicLink[];
};

export type JsonLd = Record<string, unknown>;

export const siteConfig = {
  name: "Neumas",
  url: getCanonicalAppUrl(),
  description:
    "AI-powered grocery autopilot for households in Singapore and Southeast Asia. Scan receipts, track your pantry, predict stockouts, and build smarter shopping lists.",
  contactEmail: "info@neumas.ai",
  companyName: "Neumas",
  region: "Singapore and Southeast Asia",
  ogImagePath: "/opengraph-image",
};

export const homepageFaqs: PublicFaq[] = [
  {
    question: "What is Neumas?",
    answer:
      "Neumas is an AI-powered grocery autopilot for households. It reads your receipts, keeps a living pantry, predicts stockouts, and builds smart shopping lists before you run out.",
  },
  {
    question: "How do I add groceries to Neumas?",
    answer:
      "You scan or upload a grocery receipt. Neumas extracts line items, updates your pantry, and associates them with your household history automatically.",
  },
  {
    question: "Which retailers does Neumas support?",
    answer:
      "Neumas is built to work with common grocery receipts across Singapore and Southeast Asia, including major supermarket chains and local retailers, as long as you can photograph or upload the receipt.",
  },
  {
    question: "Does Neumas require login to learn about the product?",
    answer:
      "No. The public marketing and research pages are available without login. Private dashboards and household data remain authenticated and should not be crawled.",
  },
];

const defaultRelatedLinks: PublicLink[] = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About Neumas" },
  { href: "/security", label: "Security" },
  { href: "/contact", label: "Contact" },
];

const legacyPublicPages: PublicPageContent[] = [
  {
    path: "/about",
    title: "About Neumas",
    description:
      "Learn what Neumas is building for households in Singapore and Southeast Asia: AI-powered grocery intelligence that reduces waste, surprise stockouts, and manual planning.",
    h1: "Built for households that want grocery intelligence, not guesswork.",
    eyebrow: "About",
    intro:
      "Neumas turns everyday grocery receipts into a live household inventory system. The product exists to make pantry visibility, stockout prediction, and grocery planning simple enough for real homes, not just enterprises.",
    keywords: ["about Neumas", "grocery intelligence company", "household inventory AI"],
    sections: [
      {
        title: "Why Neumas exists",
        body:
          "Most households still manage groceries with memory, sticky notes, group chats, and repeat purchases. That creates avoidable waste, missed essentials, and poor budget visibility. Neumas replaces that with a living system of record for the home pantry.",
      },
      {
        title: "What we believe",
        body:
          "Household software should feel calm, legible, and dependable. Core information should be visible without animation, available without login, and grounded in real purchase data instead of vague lifestyle claims.",
        bullets: [
          "Real pantry visibility should start from existing behavior: scanning receipts.",
          "Predictions should explain what is running low and why.",
          "Privacy matters because grocery data reveals intimate household patterns.",
        ],
      },
      {
        title: "Where Neumas is focused",
        body:
          "Neumas is designed first for Singapore and Southeast Asia, where households often buy across multiple supermarkets, convenience stores, wet markets, and delivery channels. The platform is built to handle that fragmented reality.",
      },
    ],
    relatedLinks: [
      { href: "/how-it-works", label: "See the product workflow" },
      { href: "/research/household-consumption-analytics", label: "Read the household analytics research page" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/how-it-works",
    title: "How Neumas Works",
    description:
      "See how Neumas turns a grocery receipt into pantry updates, stockout forecasts, and a smart shopping list with a server-rendered, public explanation of the workflow.",
    h1: "From receipt photo to smart shopping list.",
    eyebrow: "How it works",
    intro:
      "Neumas is designed to fit the way households already shop. Instead of requiring barcode scans or manual item entry, the workflow starts with the receipt you already have.",
    keywords: ["how Neumas works", "receipt to pantry", "smart shopping list workflow"],
    sections: [
      {
        title: "1. Capture",
        body:
          "Upload or photograph a grocery receipt. Neumas accepts ordinary receipts so the product can fit into existing shopping behavior with minimal friction.",
      },
      {
        title: "2. Extract",
        body:
          "AI reads line items, quantities, and retailer details. Low-confidence fields can be reviewed so the pantry record stays trustworthy.",
      },
      {
        title: "3. Update",
        body:
          "The pantry updates automatically. Newly purchased goods are added, retailer history is recorded, and the household inventory becomes more complete over time.",
      },
      {
        title: "4. Predict",
        body:
          "Neumas learns your household's consumption rhythm and estimates when essential items are likely to run low based on purchase history and usage patterns.",
      },
      {
        title: "5. Recommend",
        body:
          "The system builds a smart shopping list that reflects what is actually needed next, reducing duplicate purchases and emergency top-ups.",
      },
    ],
    relatedLinks: [
      { href: "/features/receipt-intelligence", label: "Receipt intelligence" },
      { href: "/features/smart-shopping-lists", label: "Smart shopping lists" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/receipt-intelligence",
    title: "Receipt Intelligence",
    description:
      "Neumas reads household grocery receipts and turns them into structured pantry data without manual item entry.",
    h1: "Receipt intelligence that turns grocery slips into clean household data.",
    eyebrow: "Feature",
    intro:
      "Receipt intelligence is the entry point to the whole Neumas system. It converts an everyday proof of purchase into structured inventory and spending data.",
    keywords: ["receipt intelligence", "grocery OCR", "receipt AI"],
    sections: [
      {
        title: "Why it matters",
        body:
          "Most households will not manually maintain an inventory app. Receipt capture lowers the effort enough to make pantry accuracy sustainable.",
      },
      {
        title: "What gets extracted",
        body:
          "Items, quantities, retailer context, and timing signals are turned into usable records that support pantry tracking, retailer analysis, and future recommendations.",
      },
      {
        title: "Accuracy and resilience",
        body:
          "Neumas is designed to work with messy retail data. When extraction confidence is low, the system can surface reviewable information instead of silently polluting the pantry record.",
      },
    ],
    relatedLinks: [
      { href: "/features/pantry-inventory", label: "Pantry inventory" },
      { href: "/how-it-works", label: "Full workflow" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/pantry-inventory",
    title: "Pantry Inventory",
    description:
      "Neumas maintains a live pantry record for the household so you can see what you have before planning the next shop.",
    h1: "A living pantry that stays closer to reality.",
    eyebrow: "Feature",
    intro:
      "The pantry is the durable memory layer of Neumas. It gives households a continuously updated view of what has been purchased and what is likely still on hand.",
    keywords: ["pantry inventory app", "household pantry tracking", "home inventory AI"],
    sections: [
      {
        title: "Visibility before planning",
        body:
          "When households can see what they already have, shopping becomes faster and less wasteful. Duplicate bottles, forgotten staples, and missed essentials become easier to avoid.",
      },
      {
        title: "Shared household context",
        body:
          "A pantry record is more useful when it reflects the whole household, not just one person's memory. Neumas keeps that shared state visible in one place.",
      },
      {
        title: "Built for real homes",
        body:
          "The system is designed for pantry shelves, fridges, and household staples rather than warehouse-style stock counts. The experience stays legible and practical on mobile.",
      },
    ],
    relatedLinks: [
      { href: "/features/stockout-prediction", label: "Stockout prediction" },
      { href: "/use-cases/families", label: "Use case: families" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/stockout-prediction",
    title: "Stockout Prediction",
    description:
      "Neumas predicts when household essentials are likely to run low so you can shop proactively instead of reactively.",
    h1: "Know what will run low before the shelf is empty.",
    eyebrow: "Feature",
    intro:
      "Stockout prediction is where pantry history becomes useful. Rather than just showing what was bought, Neumas estimates what is likely to be needed next.",
    keywords: ["stockout prediction", "grocery forecasting", "household consumption prediction"],
    sections: [
      {
        title: "Prediction from behavior",
        body:
          "Neumas learns from purchase frequency, item recurrence, and household patterns to estimate when staples like eggs, milk, rice, or cooking oil are likely to run low.",
      },
      {
        title: "Signals that stay interpretable",
        body:
          "Predictions should be understandable. Neumas focuses on practical outputs such as days remaining, expected restock windows, and list recommendations.",
      },
      {
        title: "Planning instead of firefighting",
        body:
          "Proactive household planning reduces emergency runs, inflated convenience purchases, and the stress of discovering a missing ingredient too late.",
      },
    ],
    relatedLinks: [
      { href: "/features/smart-shopping-lists", label: "Smart shopping lists" },
      { href: "/research/ai-grocery-intelligence", label: "Research on AI grocery intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/features/smart-shopping-lists",
    title: "Smart Shopping Lists",
    description:
      "Neumas builds shopping lists from pantry visibility and forecasted household demand instead of asking users to start from a blank note.",
    h1: "Shopping lists that start from what the household actually needs.",
    eyebrow: "Feature",
    intro:
      "A list is only useful if it reflects pantry reality. Neumas combines purchase history, likely depletion, and household preferences to suggest what belongs on the next grocery run.",
    keywords: ["smart shopping list", "AI grocery list", "predictive grocery list"],
    sections: [
      {
        title: "Less manual list writing",
        body:
          "Neumas reduces the time spent walking through the kitchen and reconstructing needs from memory. The list starts with predicted essentials and recent household patterns.",
      },
      {
        title: "Preference-aware suggestions",
        body:
          "Brand and retailer preferences can be reflected in recommendations so the experience feels tailored to the household rather than generic.",
      },
      {
        title: "Better multi-person coordination",
        body:
          "A shared, data-driven list reduces the chance that multiple people buy the same thing or assume someone else already handled it.",
      },
    ],
    relatedLinks: [
      { href: "/use-cases/families", label: "Use case: families" },
      { href: "/features/receipt-intelligence", label: "Receipt intelligence" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/families",
    title: "Neumas for Families",
    description:
      "How Neumas helps busy families reduce food waste, avoid duplicate purchases, and coordinate grocery planning across the household.",
    h1: "For families juggling school runs, weeknight dinners, and too many grocery decisions.",
    eyebrow: "Use case",
    intro:
      "Families manage more grocery volume, more preference complexity, and more planning overhead than a single-person household. Neumas helps create shared visibility without adding another chore.",
    keywords: ["family grocery planning", "household grocery app", "family pantry management"],
    sections: [
      {
        title: "Shared context",
        body:
          "When multiple adults buy groceries, one shared inventory memory matters. Neumas makes it easier to know what has already been purchased and what still needs attention.",
      },
      {
        title: "Less waste",
        body:
          "Families often overbuy staples to stay safe. That safety margin can become waste. Neumas helps households buy with more confidence instead of uncertainty.",
      },
      {
        title: "Faster weekly planning",
        body:
          "Instead of rebuilding a list from scratch each weekend, households start from a list informed by pantry state, predicted stockouts, and prior shopping behavior.",
      },
    ],
    relatedLinks: [
      { href: "/features/smart-shopping-lists", label: "Smart shopping lists" },
      { href: "/how-it-works", label: "How it works" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/use-cases/retail-cpg",
    title: "Retail and CPG Pilots",
    description:
      "How retail and CPG partners can use Neumas household grocery intelligence to understand shopping behavior, demand patterns, and replenishment opportunities.",
    h1: "A household intelligence layer for retail and CPG pilot programs.",
    eyebrow: "Use case",
    intro:
      "Neumas is household-first, but the same data model can support privacy-aware retail and CPG pilots that study replenishment behavior, category velocity, and basket patterns in aggregate.",
    keywords: ["retail grocery intelligence", "CPG pilot", "household demand analytics"],
    sections: [
      {
        title: "What partners can learn",
        body:
          "Partners can study how households replenish staples, what categories experience recurring stockout risk, and how price sensitivity influences repeat shopping.",
      },
      {
        title: "What stays protected",
        body:
          "Private household dashboards, personal data, and authenticated user records are not public content and should not be crawled or exposed. Public marketing pages do not reveal user data or secrets.",
      },
      {
        title: "Why this matters",
        body:
          "Retail and CPG teams often understand baskets at checkout time but not pantry state between purchases. Neumas creates a richer picture of replenishment behavior.",
      },
    ],
    relatedLinks: [
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence research" },
      { href: "/security", label: "Security and privacy stance" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/security",
    title: "Security",
    description:
      "Read the Neumas public security stance for public pages, authenticated dashboards, and household grocery data.",
    h1: "Security designed for a product that handles sensitive household patterns.",
    eyebrow: "Security",
    intro:
      "Grocery and pantry data may appear mundane, but it can reveal household routines, dietary habits, spending behavior, and presence patterns. Neumas treats that information as sensitive.",
    keywords: ["Neumas security", "household data security", "pantry privacy"],
    sections: [
      {
        title: "Public versus private surfaces",
        body:
          "Marketing, research, and documentation pages are intentionally public and server-rendered. Household dashboards, authenticated uploads, settings, and internal APIs are private surfaces and are excluded from crawler guidance.",
      },
      {
        title: "Least exposure",
        body:
          "Public pages contain company and product information only. They do not expose private user data, credentials, internal endpoints, or operational secrets.",
      },
      {
        title: "Operational stance",
        body:
          "Neumas aims for authenticated user areas to stay access-controlled, private by default, and outside search indexing. Public content remains crawlable so users and AI systems can understand the product before login.",
      },
    ],
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/privacy",
    title: "Privacy",
    description:
      "Read the public Neumas privacy stance for household grocery data, public marketing pages, and authenticated dashboards.",
    h1: "Privacy for a product that learns from household behavior.",
    eyebrow: "Privacy",
    intro:
      "Neumas is designed so public information about the company and product can be discovered easily while authenticated household data remains private and outside public crawling.",
    keywords: ["Neumas privacy", "PDPA pantry app", "household grocery privacy"],
    sections: [
      {
        title: "What public pages contain",
        body:
          "Public pages describe the company, product workflow, features, research, and policy stances. They are intended for search engines, AI assistants, and prospective users.",
      },
      {
        title: "What private areas contain",
        body:
          "Authenticated dashboards may contain receipt details, pantry records, shopping history, and preference information. Those areas are not public content and should not be crawled.",
      },
      {
        title: "Regional mindset",
        body:
          "Neumas is built with households in Singapore and Southeast Asia in mind, including the need for clear consent, limited exposure, and careful handling of personal shopping data.",
      },
    ],
    faq: [
      {
        question: "Does Neumas expose household shopping data on public pages?",
        answer:
          "No. Public pages are informational only. Household dashboards and authenticated user data are private and outside the public crawl surface.",
      },
      {
        question: "Should AI crawlers index private user dashboards?",
        answer:
          "No. Neumas explicitly instructs crawlers and LLM agents not to crawl private dashboards or authenticated user data.",
      },
    ],
    relatedLinks: [
      { href: "/security", label: "Security" },
      { href: "/contact", label: "Contact" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/terms",
    title: "Terms",
    description:
      "Public Neumas terms page covering the service at a high level for prospective users and partners.",
    h1: "Public terms for using the Neumas service.",
    eyebrow: "Terms",
    intro:
      "This page provides a high-level public summary of the terms that govern access to Neumas public content and the broader service. It does not expose internal legal operations or private customer data.",
    keywords: ["Neumas terms", "grocery app terms", "household SaaS terms"],
    sections: [
      {
        title: "Public content use",
        body:
          "Public pages may be viewed and referenced for informational purposes. They describe the product, research, and company at a high level.",
      },
      {
        title: "Authenticated service use",
        body:
          "Use of authenticated areas may require account registration, acceptance of service terms, and compliance with applicable law and product policies.",
      },
      {
        title: "No private data exposure",
        body:
          "These public terms do not publish private operational details, credentials, or user-specific agreements. Sensitive data remains outside the public site.",
      },
    ],
    relatedLinks: [
      { href: "/privacy", label: "Privacy" },
      { href: "/security", label: "Security" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/contact",
    title: "Contact",
    description:
      "Contact Neumas about the household grocery intelligence platform, retail and CPG pilots, partnerships, and product questions.",
    h1: "Talk to Neumas.",
    eyebrow: "Contact",
    intro:
      "Neumas works with households, prospective partners, and teams exploring grocery intelligence in Singapore and Southeast Asia. Use this page to reach the company without logging in.",
    keywords: ["contact Neumas", "grocery AI contact", "household inventory platform contact"],
    sections: [
      {
        title: "General inquiries",
        body:
          "For product questions, partnerships, or public information requests, email info@neumas.ai. Public contact details are intentionally available without authentication.",
      },
      {
        title: "Pilots and partnerships",
        body:
          "Retail and CPG teams exploring pilot programs can use this contact path to discuss public materials, use cases, and research-oriented collaboration.",
      },
      {
        title: "Support boundary",
        body:
          "This contact page is public. It is not an authenticated support console and does not expose private user account workflows or internal service operations.",
      },
    ],
    ctaTitle: "Email the team",
    ctaBody: "Reach Neumas at info@neumas.ai for product questions, partnerships, or public information requests.",
    relatedLinks: [
      { href: "mailto:info@neumas.ai", label: "Email info@neumas.ai" },
      { href: "/about", label: "About" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/research/ai-grocery-intelligence",
    title: "AI Grocery Intelligence Research",
    description:
      "A public research page on how Neumas approaches AI grocery intelligence, pantry visibility, and replenishment planning for households.",
    h1: "Why AI grocery intelligence matters in the household, not just at checkout.",
    eyebrow: "Research",
    intro:
      "Most grocery technology stops at recommendation or delivery. Neumas is interested in the intelligence gap between purchase and consumption: what happens inside the household after the receipt is issued.",
    keywords: ["AI grocery intelligence", "pantry intelligence", "household grocery research"],
    sections: [
      {
        title: "The missing layer",
        body:
          "Retailers know what was purchased. Households know, imperfectly, what they think is still at home. The gap between those two states creates duplicate purchases, waste, and stockouts.",
      },
      {
        title: "Why receipts are useful",
        body:
          "Receipts provide a low-friction signal that something entered the home. They are not perfect, but they are far more scalable than expecting users to manually log every pantry change.",
      },
      {
        title: "What AI adds",
        body:
          "AI helps convert unstructured proof of purchase into structured household memory, then uses history to estimate what needs attention next.",
      },
    ],
    relatedLinks: [
      { href: "/research/household-consumption-analytics", label: "Household consumption analytics" },
      { href: "/features/stockout-prediction", label: "Stockout prediction" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/research/household-consumption-analytics",
    title: "Household Consumption Analytics",
    description:
      "A public research page explaining how household consumption analytics can reduce waste and improve grocery planning.",
    h1: "Household consumption analytics should make daily life simpler, not noisier.",
    eyebrow: "Research",
    intro:
      "Consumption analytics only matter if they help people make better grocery decisions. Neumas focuses on turning purchase history into signals that are intelligible, actionable, and lightweight.",
    keywords: ["household consumption analytics", "grocery planning research", "food waste analytics"],
    sections: [
      {
        title: "Useful questions",
        body:
          "How quickly does the household finish eggs? Which staples are repeatedly overbought? When do guests or school holidays shift demand? These are the kinds of questions consumption analytics can answer.",
      },
      {
        title: "Why simplicity matters",
        body:
          "Analytics should reduce mental load. Neumas aims to surface practical outputs such as likely stockouts, waste risk, and smarter shopping list composition rather than overwhelming users with dashboards.",
      },
      {
        title: "Regional relevance",
        body:
          "Household grocery behavior in Southeast Asia spans supermarkets, neighborhood shops, fresh markets, and delivery apps. Good analytics must account for that fragmented supply pattern.",
      },
    ],
    relatedLinks: [
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence" },
      { href: "/use-cases/families", label: "Use case: families" },
      ...defaultRelatedLinks,
    ],
  },
  {
    path: "/crawler-readiness",
    title: "Crawler Readiness",
    description:
      "Public-safe diagnostics showing Neumas crawler readiness for search engines, LLM agents, and technical reviewers.",
    h1: "Crawler readiness, in one public-safe view.",
    eyebrow: "Diagnostics",
    intro:
      "This page summarizes what Neumas is, where public information lives, and whether key crawler surfaces are available without exposing private data.",
    keywords: ["crawler readiness", "AI crawler diagnostics", "Neumas technical SEO"],
    sections: [
      {
        title: "Why this page exists",
        body:
          "Search engines, LLM agents, investors, and internal reviewers need a clear, public-safe way to verify that Neumas has crawlable product information while keeping authenticated surfaces private.",
      },
      {
        title: "What is checked",
        body:
          "The diagnostic checks robots.txt, sitemap.xml, llms.txt, homepage canonical/schema tags, public-page indexability, and noindex behavior on protected routes.",
      },
    ],
    faq: homepageFaqs,
    relatedLinks: [
      { href: "/llms.txt", label: "llms.txt" },
      { href: "/sitemap.xml", label: "sitemap.xml" },
      { href: "/robots.txt", label: "robots.txt" },
      ...defaultRelatedLinks,
    ],
  },
];

const overridePagePaths = new Set(prompt89Pages.map((page) => page.path));

export const publicPages: PublicPageContent[] = [
  ...legacyPublicPages.filter((page) => !overridePagePaths.has(page.path)),
  ...prompt89Pages,
];

export function getPublicPage(path: string): PublicPageContent | undefined {
  return publicPages.find((page) => page.path === path);
}

export function buildAbsoluteUrl(path: string): string {
  const base = siteConfig.url.replace(/\/+$/, "");
  return path === "/" ? base : `${base}${path}`;
}

export function buildPublicMetadata(page: PublicPageContent): Metadata {
  const canonical = buildAbsoluteUrl(page.path);
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImagePath,
          width: 1200,
          height: 630,
          alt: `${page.title} — ${siteConfig.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
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
}

export function makeBreadcrumbs(path: string): { name: string; item: string }[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) {
    return [{ name: "Home", item: buildAbsoluteUrl("/") }];
  }

  const crumbs = [{ name: "Home", item: buildAbsoluteUrl("/") }];
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({
      name: part
        .split("-")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" "),
      item: buildAbsoluteUrl(current),
    });
  }
  return crumbs;
}

export const publicRouteIndex: PublicLink[] = publicPages.map((page) => ({
  href: page.path,
  label: page.title,
}));

export function buildOrganizationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.companyName,
    url: siteConfig.url,
    email: siteConfig.contactEmail,
    description: siteConfig.description,
    areaServed: siteConfig.region,
  };
}

export function buildContactPointSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ContactPoint",
    contactType: "customer support",
    email: siteConfig.contactEmail,
    areaServed: siteConfig.region,
    availableLanguage: ["en"],
  };
}

export function buildWebSiteSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "en",
  };
}

export function buildSoftwareApplicationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    creator: {
      "@type": "Organization",
      name: siteConfig.companyName,
      url: siteConfig.url,
    },
  };
}

export function buildProductSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: siteConfig.name,
    brand: siteConfig.name,
    description: siteConfig.description,
    category: "Household grocery intelligence software",
    url: siteConfig.url,
  };
}

export function buildWebPageSchema(page: Pick<PublicPageContent, "path" | "title" | "description">): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    description: page.description,
    url: buildAbsoluteUrl(page.path),
    isPartOf: {
      "@type": "WebSite",
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}

export function buildFaqSchema(faq: PublicFaq[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildBreadcrumbSchema(path: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: makeBreadcrumbs(path).map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}

export function buildArticleSchema(page: Pick<PublicPageContent, "path" | "title" | "description" | "intro">): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description: page.description,
    articleBody: page.intro,
    author: {
      "@type": "Organization",
      name: siteConfig.companyName,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.companyName,
    },
    mainEntityOfPage: buildAbsoluteUrl(page.path),
  };
}

export function getHomepageSchemas(): JsonLd[] {
  return [
    buildOrganizationSchema(),
    buildWebSiteSchema(),
    buildSoftwareApplicationSchema(),
    buildProductSchema(),
    buildWebPageSchema({
      path: "/",
      title: "Neumas — Your Grocery Autopilot",
      description: siteConfig.description,
    }),
    buildBreadcrumbSchema("/"),
    buildFaqSchema(homepageFaqs),
  ];
}

export function getPublicPageSchemas(page: PublicPageContent): JsonLd[] {
  const schemas: JsonLd[] = [buildWebPageSchema(page), buildBreadcrumbSchema(page.path)];
  const trustPaths = new Set([
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/security",
    "/data-processing",
    "/responsible-ai",
  ]);

  if (page.faq?.length) {
    schemas.push(buildFaqSchema(page.faq));
  }

  if (page.path.startsWith("/research/")) {
    schemas.push(buildArticleSchema(page));
  }

  if (page.path.startsWith("/features/")) {
    schemas.push(buildProductSchema());
  }

  if (page.path.startsWith("/glossary/")) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: page.title.replace(/^Glossary:\s*/, ""),
      description: page.description,
      termCode: page.path,
      inDefinedTermSet: buildAbsoluteUrl("/glossary"),
    });
  }

  if (trustPaths.has(page.path)) {
    schemas.push(buildOrganizationSchema(), buildContactPointSchema());
  }

  return schemas;
}