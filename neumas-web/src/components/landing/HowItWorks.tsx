/* Server component */
import Image from "next/image";
import { Camera, Cpu, Zap } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: Camera,
    title: "Capture",
    body:
      "Upload any receipt, invoice, or delivery note — photo, PDF, or email attachment. Neumas reads it instantly using AI vision optimised for food-service documents.",
    detail: "Supports photos, PDFs, emails, and EDI feeds",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] tracking-widest text-gray-400 uppercase">Invoice detected</p>
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0071a3]" />
        </div>
        <div className="mb-3 flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
          <p className="text-center text-[11px] text-gray-400">
            invoice_fresh_direct_2847.pdf
            <br />
            <span className="text-[10px] text-gray-300">Processing…</span>
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-3/4 animate-pulse rounded-full bg-[#0071a3]" />
        </div>
        <p className="mt-2 font-mono text-[10px] text-[#0071a3]">Extracting 18 line items…</p>
      </div>
    ),
  },
  {
    num: "02",
    icon: Cpu,
    title: "Understand",
    body:
      "Every item is normalised, matched to your inventory catalogue, and cross-referenced with historical vendor prices. Discrepancies are flagged before they reach your books.",
    detail: "Vendor normalisation, price comparison, confidence scoring",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Normalisation result</p>
        <div className="space-y-1.5">
          {[
            { raw: "Chkn Brst 5kg", norm: "Chicken Breast 5 kg", conf: 98 },
            { raw: "Slmn Flt 3KG", norm: "Salmon Fillet 3 kg", conf: 95 },
            { raw: "Olive Oil 1L x12", norm: "Olive Oil 1 L × 12", conf: 99 },
          ].map((r) => (
            <div key={r.raw} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[10px] text-gray-400 line-through">{r.raw}</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-gray-800">{r.norm}</p>
                <span className="font-mono text-[10px] text-emerald-600">{r.conf}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "03",
    icon: Zap,
    title: "Act",
    body:
      "Live inventory updates automatically. Alerts fire when stock drops below threshold. Reorder recommendations surface before you run out, complete with vendor pricing.",
    detail: "Live inventory, predictive alerts, reorder intelligence",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Actions generated</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <p className="text-[11px] text-emerald-800">Inventory updated · 18 items</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <p className="text-[11px] text-amber-800">Alert · Chicken approaching low</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-[#f0f7fb] px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0071a3]" />
            <p className="text-[11px] text-[#0071a3]">Reorder suggested · Metro Wholesale</p>
          </div>
        </div>
      </div>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            How it works
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            From paper invoice to
            <br />
            live intelligence.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Three steps. No integrations required to start. No hardware. No re-training your team.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[0.05]"
              >
                {/* Step header */}
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071a3]/10">
                    <Icon className="h-5 w-5 text-[#0071a3]" />
                  </div>
                  <span className="font-mono text-[28px] font-bold text-gray-100">{step.num}</span>
                </div>

                <h3 className="mt-4 text-[18px] font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-gray-500">{step.body}</p>

                <p className="mt-3 font-mono text-[11px] text-gray-400">{step.detail}</p>

                {/* Visual */}
                <div className="mt-5">{step.visual}</div>
              </div>
            );
          })}
        </div>

        {/* Connector label */}
        <p className="mt-10 text-center font-mono text-[12px] text-gray-400">
          Capture → Understand → Act · Typically under 90 seconds per document
        </p>

        {/* Process graphic */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-black/[0.06] shadow-xl shadow-black/[0.06]">
          <Image
            src="/process graphic.png"
            alt="Neumas Control — end-to-end procurement intelligence process"
            width={1400}
            height={560}
            className="w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
