"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, TrendingDown, AlertTriangle, CheckCircle2, BarChart3 } from "lucide-react";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.55, ease: "easeOut" as const },
  };
}

/* ── Floating UI fragment: spend intelligence card ── */
function SpendCard() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-xl shadow-black/[0.06]">
      <p className="mb-3 font-mono text-[10px] font-medium tracking-widest text-gray-400 uppercase">
        This Week · Spend vs Budget
      </p>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-bold tracking-tight text-gray-900">$14,280</p>
          <p className="mt-0.5 text-xs text-gray-400">of $18,500 budget</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <TrendingDown className="h-3.5 w-3.5" />
          −8% vs last week
        </span>
      </div>
      {/* spend bar */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#0071a3]"
          style={{ width: "77%" }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Protein", pct: 38, color: "bg-[#0071a3]" },
          { label: "Produce", pct: 29, color: "bg-cyan-400" },
          { label: "Dry goods", pct: 33, color: "bg-gray-300" },
        ].map((c) => (
          <div key={c.label}>
            <div className="h-1 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${c.color}`} style={{ width: `${c.pct * 2.6}%` }} />
            </div>
            <p className="mt-1 text-[10px] text-gray-400">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Floating UI fragment: AI alert card ── */
function AlertCard() {
  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 shadow-lg shadow-amber-100/40 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <div>
          <p className="text-[12px] font-semibold text-amber-900">Stockout forecast · High confidence</p>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Chicken breast · Outlet 3 · 2 days remaining
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-amber-200">
            <div className="h-full w-[84%] rounded-full bg-amber-500" />
          </div>
          <p className="mt-1 font-mono text-[10px] text-amber-600">84% confidence</p>
        </div>
      </div>
    </div>
  );
}

/* ── Floating UI fragment: document extraction card ── */
function ExtractionCard() {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 shadow-xl shadow-black/[0.05]">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] font-medium tracking-widest text-gray-400 uppercase">
          AI Extraction · Invoice
        </p>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          97% confidence
        </span>
      </div>
      <div className="space-y-2">
        {[
          { item: "Chicken Breast 5kg", qty: "6 units", price: "$189.00" },
          { item: "Salmon Fillet 3kg", qty: "4 units", price: "$256.00" },
          { item: "Premium Olive Oil", qty: "12 btl", price: "$144.00" },
        ].map((row) => (
          <div key={row.item} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
            <div>
              <p className="text-[11px] font-medium text-gray-800">{row.item}</p>
              <p className="text-[10px] text-gray-400">{row.qty}</p>
            </div>
            <p className="font-mono text-[11px] font-medium text-gray-700">{row.price}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Floating UI fragment: reorder recommendation ── */
function ReorderCard() {
  return (
    <div className="rounded-2xl border border-[#0071a3]/15 bg-[#f0f7fb] p-4 shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-[#0071a3]" />
        <p className="text-[11px] font-semibold text-[#0071a3]">Reorder recommendations · 3 items</p>
      </div>
      {[
        { vendor: "Metro Wholesale", items: "4 items", saving: "Save $42" },
        { vendor: "Fresh Direct SG", items: "2 items", saving: "Best price" },
      ].map((r) => (
        <div key={r.vendor} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 mb-1.5 shadow-sm">
          <div>
            <p className="text-[11px] font-semibold text-gray-800">{r.vendor}</p>
            <p className="text-[10px] text-gray-400">{r.items}</p>
          </div>
          <span className="rounded-full bg-[#0071a3]/10 px-2 py-0.5 text-[10px] font-semibold text-[#0071a3]">
            {r.saving}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Hero() {
  return (
    <section
      id="hero"
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
                Neumas Control
              </span>
            </motion.span>

            <motion.h1
              {...fadeUp(0.08)}
              className="text-[42px] font-bold leading-[1.08] tracking-tight text-gray-900 sm:text-[54px] lg:text-[60px]"
            >
              Your procurement,
              <br />
              <span className="text-[#0071a3]">on autopilot.</span>
            </motion.h1>

            <motion.p
              {...fadeUp(0.16)}
              className="mt-6 max-w-lg text-[17px] leading-relaxed text-gray-500"
            >
              Upload a receipt or invoice. Neumas extracts every line item,
              updates your live inventory, forecasts stockouts, and surfaces
              reorder intelligence — across every outlet, automatically.
            </motion.p>

            <motion.div
              {...fadeUp(0.24)}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link
                href="/auth"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-7 py-3.5 text-[14px] font-semibold text-white shadow-md shadow-[#0071a3]/25 transition-all hover:bg-[#005f8a] hover:shadow-lg hover:shadow-[#0071a3]/30 hover:-translate-y-0.5"
              >
                Book a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-7 py-3.5 text-[14px] font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5"
              >
                Start pilot
              </Link>
            </motion.div>

            <motion.div
              {...fadeUp(0.32)}
              className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              {[
                "14-day pilot included",
                "No hardware required",
                "Multi-outlet ready",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[12px] text-gray-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right: product hero image with floating overlay cards */}
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

            {/* Main hero image */}
            <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] shadow-2xl shadow-black/[0.10]">
              <Image
                src="/Hero image.png"
                alt="Neumas Control — procurement command center"
                width={800}
                height={560}
                className="w-full object-cover object-top"
                priority
              />
              {/* Floating stat pill over the image */}
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute bottom-5 left-5 flex items-center gap-2.5 rounded-2xl border border-white/60 bg-white/90 px-4 py-3 shadow-lg backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                  <TrendingDown className="h-4 w-4 text-emerald-600" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-gray-800">Week spend · −8% vs last</p>
                  <p className="font-mono text-[10px] text-gray-400">$14,280 of $18,500 budget</p>
                </div>
              </motion.div>
              {/* Alert pill top-right */}
              <motion.div
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.8 }}
                className="absolute right-5 top-5 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50/95 px-3 py-2 shadow-lg backdrop-blur-sm"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                <p className="text-[11px] font-semibold text-amber-900">2 stockout forecasts</p>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Mobile product preview */}
        <motion.div
          {...fadeUp(0.3)}
          className="mt-14 lg:hidden"
        >
          <div className="overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
            <Image
              src="/Hero image.png"
              alt="Neumas Control — procurement command center"
              width={800}
              height={560}
              className="w-full object-cover"
              priority
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
