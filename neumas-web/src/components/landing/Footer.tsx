/* Server component */
import Link from "next/link";

function scrollTo(id: string) {
  if (typeof document !== "undefined") {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }
}

const PRODUCT_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Features", id: "value-stack" },
  { label: "Intelligence", id: "intelligence" },
  { label: "Product", id: "product" },
  { label: "Pilot", id: "pilot" },
];

const COMPANY_LINKS = [
  { label: "Insights", href: "/insights" },
  { label: "Contact", href: "mailto:info@neumas.ai" },
];

const LEGAL_LINKS = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms of service", href: "/terms" },
  { label: "Security", href: "/security" },
];

export function Footer() {
  return (
    <footer className="border-t border-black/[0.06] bg-[#f5f5f7] px-5 py-14 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[14px] font-semibold tracking-[0.08em] text-[#0071a3]">
                NEUMAS
              </span>
              <span className="rounded bg-[#0071a3]/10 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-widest text-[#0071a3]">
                CONTROL
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-500">
              AI procurement control for food operators.
            </p>
            <p className="mt-4 text-[12px] text-gray-400">
              <a
                href="mailto:info@neumas.ai"
                className="hover:text-[#0071a3] transition-colors"
              >
                info@neumas.ai
              </a>
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="mb-4 text-[12px] font-semibold tracking-wide text-gray-700 uppercase">
              Product
            </p>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.id}>
                  <a
                    href={`#${l.id}`}
                    className="text-[13px] text-gray-500 transition-colors hover:text-gray-900"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="mb-4 text-[12px] font-semibold tracking-wide text-gray-700 uppercase">
              Company
            </p>
            <ul className="space-y-2.5">
              {COMPANY_LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-[13px] text-gray-500 transition-colors hover:text-gray-900"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="mb-4 text-[12px] font-semibold tracking-wide text-gray-700 uppercase">
              Legal
            </p>
            <ul className="space-y-2.5">
              {LEGAL_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-[13px] text-gray-500 transition-colors hover:text-gray-900"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-black/[0.06] pt-8 sm:flex-row">
          <p className="text-[12px] text-gray-400">
            &copy; {new Date().getFullYear()} Neumas. All rights reserved.
          </p>
          <p className="text-[12px] text-gray-400">
            Singapore · Malaysia · UAE · Expanding 2026
          </p>
        </div>
      </div>
    </footer>
  );
}
