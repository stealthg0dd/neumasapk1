import Link from "next/link";

import { PublicSiteFooter, PublicSiteHeader } from "@/components/public/PublicSiteChrome";
import { StructuredData } from "@/components/public/StructuredData";
import {
  buildAbsoluteUrl,
  buildPublicMetadata,
  getPublicPage,
  getPublicPageSchemas,
  publicRouteIndex,
  siteConfig,
} from "@/lib/public-site";

type DiagnosticCheck = {
  key: string;
  label: string;
  passed: boolean;
  details: string;
};

const LAST_UPDATED_ISO = "2026-05-18";

const maybePage = getPublicPage("/crawler-readiness");

if (!maybePage) {
  throw new Error("/crawler-readiness content is missing");
}

const page = maybePage;

export const metadata = buildPublicMetadata(page);

export const dynamic = "force-dynamic";

async function fetchText(path: string): Promise<string | null> {
  try {
    const response = await fetch(buildAbsoluteUrl(path), {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

function hasNoIndex(html: string | null): boolean {
  if (!html) {
    return false;
  }
  const normalized = html.toLowerCase();
  return normalized.includes('name="robots" content="noindex') || normalized.includes('name="googlebot" content="noindex');
}

function hasCanonical(html: string | null): boolean {
  if (!html) {
    return false;
  }
  return html.toLowerCase().includes('rel="canonical"');
}

function hasSchema(html: string | null): boolean {
  if (!html) {
    return false;
  }
  return html.includes('application/ld+json');
}

async function getDiagnostics(): Promise<DiagnosticCheck[]> {
  const [robotsText, sitemapText, llmsText, homepageHtml, aboutHtml, howItWorksHtml, dashboardHtml, onboardHtml] = await Promise.all([
    fetchText("/robots.txt"),
    fetchText("/sitemap.xml"),
    fetchText("/llms.txt"),
    fetchText("/"),
    fetchText("/about"),
    fetchText("/how-it-works"),
    fetchText("/dashboard"),
    fetchText("/onboard"),
  ]);

  const publicPagesIndexable = [aboutHtml, howItWorksHtml].every((html) => html !== null && !hasNoIndex(html));
  const protectedNoIndex = [dashboardHtml, onboardHtml].every((html) => hasNoIndex(html));

  return [
    {
      key: "robots",
      label: "robots.txt available",
      passed: robotsText !== null,
      details: robotsText ? "Crawl policy endpoint is reachable." : "robots.txt could not be fetched.",
    },
    {
      key: "sitemap",
      label: "sitemap available",
      passed: sitemapText !== null && sitemapText.includes("<urlset"),
      details: sitemapText?.includes("<urlset")
        ? "Sitemap is reachable and appears valid XML."
        : "Sitemap endpoint is missing or invalid.",
    },
    {
      key: "llms",
      label: "llms.txt available",
      passed: llmsText !== null && llmsText.toLowerCase().includes("neumas"),
      details: llmsText ? "LLM-readable summary is reachable." : "llms.txt could not be fetched.",
    },
    {
      key: "schema",
      label: "schema present",
      passed: hasSchema(homepageHtml),
      details: hasSchema(homepageHtml)
        ? "Homepage includes JSON-LD blocks."
        : "Homepage schema blocks were not detected.",
    },
    {
      key: "canonical",
      label: "canonical present",
      passed: hasCanonical(homepageHtml),
      details: hasCanonical(homepageHtml)
        ? "Homepage includes a canonical URL."
        : "Homepage canonical link was not detected.",
    },
    {
      key: "public-index",
      label: "public pages indexable",
      passed: publicPagesIndexable,
      details: publicPagesIndexable
        ? "Sample public pages do not advertise noindex directives."
        : "One or more sampled public pages appear non-indexable.",
    },
    {
      key: "protected-noindex",
      label: "protected pages not indexable",
      passed: protectedNoIndex,
      details: protectedNoIndex
        ? "Protected surfaces include noindex directives."
        : "Protected surfaces are missing expected noindex directives.",
    },
  ];
}

export default async function CrawlerReadinessPage() {
  const diagnostics = await getDiagnostics();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eef3f9_45%,#ffffff_100%)] text-gray-900">
      <StructuredData data={getPublicPageSchemas(page)} />
      <PublicSiteHeader />

      <main className="px-5 pb-20 pt-14 sm:px-8 sm:pt-18">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="rounded-[30px] border border-white/80 bg-white/80 p-8 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-10">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0071a3]">Crawler Readiness</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">{page.h1}</h1>
            <p className="mt-5 max-w-4xl text-lg leading-8 text-gray-600">{page.intro}</p>
            <div className="mt-6 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
              <p><span className="font-semibold text-gray-900">Company:</span> {siteConfig.companyName}</p>
              <p><span className="font-semibold text-gray-900">Product category:</span> Household grocery intelligence software</p>
              <p><span className="font-semibold text-gray-900">Last updated:</span> {new Date(LAST_UPDATED_ISO).toLocaleDateString()}</p>
              <p>
                <span className="font-semibold text-gray-900">Contact:</span>{" "}
                <Link href="/contact" className="text-[#0071a3] hover:text-[#005f8a]">Contact Neumas</Link>
              </p>
            </div>
          </section>

          <section className="rounded-[30px] border border-black/[0.06] bg-white/85 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950">Technical checks</h2>
            <div className="mt-6 grid gap-3">
              {diagnostics.map((check) => (
                <article
                  key={check.key}
                  className={`rounded-2xl border px-4 py-3 ${
                    check.passed
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-amber-200 bg-amber-50/70"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {check.passed ? "Pass" : "Needs review"} · {check.label}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{check.details}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-[28px] border border-black/[0.06] bg-white/85 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950">Key workflows</h2>
              <ul className="mt-5 space-y-2 text-sm leading-7 text-gray-600">
                <li>1. Upload a receipt image.</li>
                <li>2. Extract line items and metadata.</li>
                <li>3. Update pantry inventory.</li>
                <li>4. Recompute household baseline.</li>
                <li>5. Refresh stockout predictions and shopping actions.</li>
              </ul>

              <h3 className="mt-7 text-base font-semibold text-gray-900">Target users</h3>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-gray-600">
                <li>Busy families and shared households.</li>
                <li>Budget-conscious and health-conscious home shoppers.</li>
                <li>Retail and CPG pilot teams using aggregate signals.</li>
              </ul>
            </article>

            <article className="rounded-[28px] border border-black/[0.06] bg-white/85 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950">Public pages index</h2>
              <ul className="mt-5 max-h-[360px] space-y-2 overflow-auto pr-2 text-sm leading-7 text-gray-600">
                {publicRouteIndex.map((route) => (
                  <li key={route.href}>
                    <Link href={route.href} className="transition-colors hover:text-gray-900">
                      {route.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="rounded-[28px] border border-black/[0.06] bg-white/85 p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:p-10">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-gray-950">FAQ</h2>
            <dl className="mt-6 space-y-5">
              {(page.faq ?? []).map((faq) => (
                <div key={faq.question}>
                  <dt className="text-base font-semibold text-gray-900">{faq.question}</dt>
                  <dd className="mt-1 text-sm leading-7 text-gray-600">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>

      <PublicSiteFooter />
    </div>
  );
}