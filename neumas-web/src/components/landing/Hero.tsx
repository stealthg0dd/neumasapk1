"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.55, ease: "easeOut" as const },
  };
}

/* ── Floating UI fragment: pantry stock card ── */
function PantryCard() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl shadow-black/[0.06]">
      <p className="mb-3 font-mono text-[10px] font-medium tracking-widest text-gray-400 uppercase">
        Pantry · Updated just now
      </p>
      <div className="space-y-2">
        {[
          { name: "Rice (5kg)", days: "14 days left", pct: 80, color: "bg-emerald-400" },
          { name: "Cooking Oil", days: "3 days left", pct: 18, color: "bg-red-400" },
          { name: "Eggs (×30)", days: "6 days left", pct: 40, color: "bg-amber-400" },
        ].map((item) => (
          <div key={item.name} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-medium text-gray-800">{item.name}</p>
                <p className="font-mono text-[10px] text-gray-400">{item.days}</p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Floating UI fragment: AI stockout alert ── */
function StockoutCard() {
  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/90 p-4 shadow-lg shadow-amber-100/40 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-amber-900">Running low · Cooking Oil</p>
          <p className="mt-0.5 text-[11px] text-amber-700">
            ~3 days remaining based on your usage
          </p>
          <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
            Added to shopping list ✓
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Floating UI fragment: receipt extraction card ── */
function ExtractionCard() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-xl shadow-black/[0.05]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] font-medium tracking-widest text-gray-400 uppercase">
          Receipt scanned
        </p>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          12 items found
        </span>
      </div>
      <div className="space-y-1.5">
        {[
          { item: "Jasmine Rice 5kg", qty: "1 bag" },
          { item: "Chicken Thighs", qty: "1.2 kg" },
          { item: "Broccoli", qty: "400 g" },
        ].map((row) => (
          <div key={row.item} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-[11px] font-medium text-gray-800">{row.item}</p>
            <p className="font-mono text-[10px] text-gray-500">{row.qty}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] text-[#0071a3]">Pantry updated automatically</p>
    </div>
  );
}

/* ── Floating UI fragment: smart shopping list card ── */
function ShoppingListCard() {
  return (
    <div className="rounded-2xl border border-[#0071a3]/15 bg-[#f0f7fb] p-4 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-[#0071a3]" />
        <p className="text-[11px] font-semibold text-[#0071a3]">Smart shopping list · 5 items</p>
      </div>
      {[
        { item: "Cooking Oil 2L", reason: "Running out in 3 days" },
        { item: "Eggs ×30", reason: "Below weekly average" },
        { item: "Soy Sauce", reason: "Not restocked in 3 weeks" },
      ].map((r) => (
        <div key={r.item} className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 mb-1.5 shadow-sm">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0071a3]" />
          <div>
            <p className="text-[11px] font-semibold text-gray-800">{r.item}</p>
            <p className="text-[10px] text-gray-400">{r.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Hero() {
  return (
    <section
      id="hero"
      aria-label="Neumas — Your Grocery Autopilot"
      className="relative overflow-hidden bg-white px-5 pb-28 pt-20 sm:px-8 sm:pb-32 sm:pt-24 lg:pt-28"
    >
      {/* Subtle background gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,113,163,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-12">
          {/* Left: text */}
          <div className="flex flex-col items-start">
            <motion.span
              {...fadeUp(0)}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#0071a3]/20 bg-[#f0f7fb] px-3.5 py-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#0071a3]" />
              <span className="font-mono text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
                AI-powered pantry intelligence
              </span>
            </motion.span>

            <motion.h1
              {...fadeUp(0.08)}
              className="text-[42px] font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-[54px] lg:text-[60px]"
            >
              Your Grocery
              <br />
              <span className="text-[#0071a3]">Autopilot.</span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.16)}
              className="mt-6 max-w-lg text-[17px] leading-relaxed text-gray-500"
            >
              Scan a receipt. Neumas reads every item, tracks your pantry
              automatically, predicts what you&apos;ll run out of, and builds
              your smart shopping list — before you even notice.
            </motion.p>

            <motion.div
              {...fadeUp(0.24)}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/auth"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-7 py-3.5 text-[14px] font-semibold text-white shadow-md shadow-[#0071a3]/25 transition-all hover:bg-[#005f8a] hover:shadow-lg hover:shadow-[#0071a3]/30 hover:-translate-y-0.5"
              >
                Start scanning receipts
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-[14px] font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5"
              >
                See how it works
              </a>
            </motion.div>

            <motion.p
              {...fadeUp(0.32)}
              className="mt-7 text-[13px] text-gray-400"
            >
              Built for households in Singapore and Southeast Asia
            </motion.p>

            <motion.div
              {...fadeUp(0.38)}
              className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              {[
                "Free to start",
                "No hardware needed",
                "Works with any receipt",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[12px] text-gray-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right: floating product cards */}
          <motion.div
            {...fadeUp(0.2)}
            className="relative hidden lg:block"
          >
            {/* Background blur blobs */}
            <div
              aria-hidden
              className="absolute right-0 top-1/4 h-72 w-72 rounded-full bg-[#0071a3]/8 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -left-8 bottom-1/4 h-48 w-48 rounded-full bg-cyan-400/10 blur-2xl"
            />

            <div className="relative flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-4">
                  <PantryCard />
                  <StockoutCard />
                </div>
                <div className="flex flex-col gap-4 pt-8">
                  <ExtractionCard />
                  <ShoppingListCard />
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Mobile product preview — stacked single card */}
        <motion.div
          {...fadeUp(0.3)}
          className="mt-14 lg:hidden"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PantryCard />
            <ExtractionCard />
          </div>
        </motion.div>
      </div>
    </section>
  );
}



