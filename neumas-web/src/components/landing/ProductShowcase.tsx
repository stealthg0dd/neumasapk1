"use client";

import { useState } from "react";
import Image from "next/image";

type Tab = {
  id: string;
  label: string;
  description: string;
  visual: React.ReactNode;
};

const TABS: Tab[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Your complete household pantry command centre — what you have, what's running low, recent scans, and your smart shopping list, all on one screen.",
    visual: (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
        <Image
          src="/dashboard showcase.png"
          alt="Neumas Control dashboard overview"
          width={800}
          height={600}
          className="w-full object-cover object-top"
          priority
        />
      </div>
    ),
  },
  {
    id: "documents",
    label: "Receipt Scanner",
    description: "Every receipt you scan is processed by AI instantly — items extracted, quantities tracked, and your pantry updated automatically. Review anything flagged before it posts.",
    visual: (
      <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[14px] font-semibold text-gray-900">Review queue · 4 items</p>
          <span className="rounded-full bg-[#0071a3]/10 px-3 py-1 text-[11px] font-semibold text-[#0071a3]">
            Needs approval
          </span>
        </div>
        <div className="space-y-3">
          {[
            { name: "Metro Wholesale #8841", lines: 22, conf: 73, flag: "Price variance" },
            { name: "Bakery Delivery 0418", lines: 8, conf: 61, flag: "Low confidence" },
          ].map((doc) => (
            <div key={doc.name} className="rounded-xl border border-black/[0.06] p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-[13px] font-semibold text-gray-800">{doc.name}</p>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {doc.flag}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${doc.conf}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-gray-500">{doc.conf}% conf</span>
              </div>
              <p className="mt-2 text-[10px] text-gray-400">{doc.lines} line items</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="rounded-lg bg-[#0071a3] px-3 py-1.5 text-[11px] font-semibold text-white">
                  Review &amp; approve
                </button>
                <button type="button" className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600">
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "alerts",
    label: "Stockout Alerts",
    description: "A consolidated view of every stockout forecast, expiry risk, and restocking suggestion — sorted by urgency so you know exactly what to prioritise on your next shop.",
    visual: (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
        <Image
          src="/alerts center.png"
          alt="Neumas Control alerts center"
          width={800}
          height={600}
          className="w-full object-cover object-top"
        />
      </div>
    ),
  },
  {
    id: "reports",
    label: "Weekly Summary",
    description: "Your weekly household grocery summary — what you spent, what you bought most, what went to waste, and where you can save. Delivered automatically, every week.",
    visual: (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
        <Image
          src="/Weekly report.png"
          alt="Neumas Control weekly procurement report"
          width={800}
          height={600}
          className="w-full object-cover object-top"
        />
      </div>
    ),
  },
  {
    id: "vendors",
    label: "Retailer Insights",
    description: "See exactly how much you spend at each supermarket, how prices trend on your regular items, and whether you're getting the best deal across NTUC, Cold Storage, Sheng Siong, and more.",
    visual: (
      <div className="overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
        <Image
          src="/Vendor intelligence.png"
          alt="Neumas Control vendor intelligence"
          width={800}
          height={600}
          className="w-full object-cover object-top"
        />
      </div>
    ),
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState("overview");
  const current = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <section
      id="product"
      aria-label="Neumas dashboard preview"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            The dashboard
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Your household pantry
            <br />
            at a glance.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            A single screen showing what you have, what&apos;s running low, and what to buy next
            — always up to date, always accurate.
          </p>
        </div>

        {/* Tab bar */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                active === tab.id
                  ? "bg-[#0071a3] text-white shadow-sm"
                  : "bg-[#f5f5f7] text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div className="flex flex-col justify-center py-4">
            <h3 className="text-[22px] font-bold text-gray-900">{current.label}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-500">{current.description}</p>
          </div>
          <div>{current.visual}</div>
        </div>
      </div>
    </section>
  );
}
