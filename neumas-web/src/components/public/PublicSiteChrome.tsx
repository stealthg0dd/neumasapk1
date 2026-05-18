import Link from "next/link";

const headerLinks = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/features/receipt-intelligence", label: "Features" },
  { href: "/use-cases/families", label: "Use cases" },
  { href: "/research/ai-grocery-intelligence", label: "Research" },
  { href: "/contact", label: "Contact" },
];

const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Homepage" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/features/receipt-intelligence", label: "Receipt intelligence" },
      { href: "/features/pantry-inventory", label: "Pantry inventory" },
      { href: "/features/stockout-prediction", label: "Stockout prediction" },
      { href: "/features/smart-shopping-lists", label: "Smart shopping lists" },
    ],
  },
  {
    title: "Use cases",
    links: [
      { href: "/use-cases/families", label: "Families" },
      { href: "/use-cases/retail-cpg", label: "Retail and CPG pilots" },
      { href: "/research/ai-grocery-intelligence", label: "AI grocery intelligence" },
      { href: "/research/household-consumption-analytics", label: "Consumption analytics" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/data-processing", label: "Data processing" },
      { href: "/responsible-ai", label: "Responsible AI" },
      { href: "/security", label: "Security" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/sitemap.xml", label: "Sitemap" },
      { href: "/llms.txt", label: "llms.txt" },
      { href: "/crawler-readiness", label: "Crawler readiness" },
    ],
  },
];

export function PublicSiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
        <Link href="/" className="font-mono text-[15px] font-semibold tracking-[0.08em] text-[#0071a3]">
          NEUMAS
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {headerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/auth" className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-black/[0.04]">
            Sign in
          </Link>
          <Link
            href="/auth"
            className="rounded-full bg-[#0071a3] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005f8a]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <p className="font-mono text-[14px] font-semibold tracking-[0.08em] text-[#0071a3]">NEUMAS</p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-gray-600">
              Neumas is an early-stage but serious grocery intelligence platform for households in Singapore and Southeast Asia.
              We turn receipts into pantry visibility, stockout prediction, and practical weekly planning support.
            </p>
            <p className="mt-4 text-sm text-gray-500">info@neumas.ai</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-700">{column.title}</h2>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-gray-600 transition-colors hover:text-gray-900">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-black/[0.06] pt-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Public pages are crawlable. Authenticated dashboards and user data are private.</p>
          <p>{new Date().getFullYear()} Neumas</p>
        </div>
      </div>
    </footer>
  );
}