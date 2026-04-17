"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "How it works", id: "how-it-works" },
  { label: "Features", id: "value-stack" },
  { label: "Intelligence", id: "intelligence" },
  { label: "Pricing", id: "pilot" },
] as const;

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-black/[0.06] bg-white/90 shadow-sm backdrop-blur-xl"
          : "bg-white/70 backdrop-blur-md"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 select-none" aria-label="Neumas Control">
          <span className="font-mono text-[15px] font-semibold tracking-[0.08em] text-[#0071a3]">NEUMAS</span>
          <span className="hidden rounded bg-[#f0f7fb] px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-widest text-[#0071a3] sm:block">
            CONTROL
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => scrollTo(l.id)}
              className="text-[13.5px] font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
              {l.label}
            </button>
          ))}
          <Link
            href="/insights"
            className="text-[13.5px] font-medium text-gray-500 transition-colors hover:text-gray-900"
          >
            Insights
          </Link>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2.5 md:flex">
          <Link
            href="/auth"
            className="rounded-lg px-4 py-2 text-[13.5px] font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            Sign in
          </Link>
          <Link
            href="/pilot"
            className="rounded-lg bg-[#0071a3] px-5 py-2 text-[13.5px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a] hover:shadow-md"
          >
            Book a demo
          </Link>
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-5 pb-6 pt-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => { scrollTo(l.id); setOpen(false); }}
                className="rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {l.label}
              </button>
            ))}
            <Link
              href="/insights"
              className="rounded-lg px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              onClick={() => setOpen(false)}
            >
              Insights
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-gray-100 pt-4">
            <Link
              href="/auth"
              className="rounded-lg border border-gray-200 px-4 py-3 text-center text-sm font-medium text-gray-700"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-lg bg-[#0071a3] px-4 py-3 text-center text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Book a demo
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
