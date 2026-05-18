/* Server component */
import { Camera, Cpu, RefreshCw, TrendingDown, ShoppingCart } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: Camera,
    title: "Upload your receipt",
    body:
      "Take a photo of any grocery receipt — NTUC, Cold Storage, Sheng Siong, Giant, or any supermarket. Upload the photo or a PDF. Neumas reads it instantly.",
    detail: "Supports photos, PDFs, digital receipts",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] tracking-widest text-gray-400 uppercase">Receipt detected</p>
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#0071a3]" />
        </div>
        <div className="mb-3 flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
          <p className="text-center text-[11px] text-gray-400">
            NTUC_receipt_12may.jpg
            <br />
            <span className="text-[10px] text-gray-300">Processing…</span>
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-3/4 animate-pulse rounded-full bg-[#0071a3]" />
        </div>
        <p className="mt-2 font-mono text-[10px] text-[#0071a3]">Reading 14 items…</p>
      </div>
    ),
  },
  {
    num: "02",
    icon: Cpu,
    title: "AI extracts every item",
    body:
      "Every line item — names, quantities, prices — is extracted and matched to your pantry catalogue automatically. No manual entry, ever.",
    detail: "AI normalises names, quantities, and units",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Items extracted</p>
        <div className="space-y-1.5">
          {[
            { raw: "Jsmn Rice 5KG", norm: "Jasmine Rice 5 kg", conf: 98 },
            { raw: "Chicken Thigh ~1.2kg", norm: "Chicken Thigh 1.2 kg", conf: 95 },
            { raw: "Broc 400g", norm: "Broccoli 400 g", conf: 96 },
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
    icon: RefreshCw,
    title: "Pantry updates automatically",
    body:
      "Your digital pantry reflects exactly what you bought and when. Quantities are tracked over time so Neumas always knows your current stock — without you counting anything.",
    detail: "Live pantry across all food categories",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Pantry · Updated 2 min ago</p>
        <div className="space-y-2">
          {[
            { name: "Jasmine Rice 5kg", level: 85, color: "bg-emerald-400" },
            { name: "Chicken Thigh", level: 70, color: "bg-emerald-400" },
            { name: "Broccoli", level: 60, color: "bg-amber-400" },
          ].map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-gray-700">{item.name}</p>
                <span className="font-mono text-[9px] text-emerald-600">Updated ✓</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.level}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "04",
    icon: TrendingDown,
    title: "Stockout prediction runs",
    body:
      "Based on your household's real consumption rate, Neumas calculates when each item will run out — days or weeks in advance — so you never get caught empty-handed.",
    detail: "Per-item prediction using your consumption history",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Stockout forecast</p>
        <div className="space-y-2">
          {[
            { name: "Cooking Oil 2L", days: "3 days", urgency: "text-red-500" },
            { name: "Eggs ×30", days: "5 days", urgency: "text-amber-500" },
            { name: "Soy Sauce", days: "12 days", urgency: "text-gray-400" },
          ].map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-700">{item.name}</p>
              <span className={`font-mono text-[10px] font-semibold ${item.urgency}`}>{item.days} left</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "05",
    icon: ShoppingCart,
    title: "Smart shopping list generated",
    body:
      "A personalised shopping list is ready before your next trip — ordered by urgency, with quantities based on your usage patterns. Just open and go.",
    detail: "Sorted by urgency · Based on your real consumption",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Your list · This week</p>
        <div className="space-y-1.5">
          {[
            { item: "Cooking Oil 2L", tag: "Running out soon", color: "bg-red-50 border-red-100" },
            { item: "Eggs ×30", tag: "Low stock", color: "bg-amber-50 border-amber-100" },
            { item: "Soy Sauce", tag: "Regular restock", color: "bg-[#f0f7fb] border-[#0071a3]/15" },
          ].map((r) => (
            <div key={r.item} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${r.color}`}>
              <p className="text-[11px] font-medium text-gray-800">{r.item}</p>
              <p className="text-[10px] text-gray-500">{r.tag}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] text-[#0071a3]">Ready to share with your household</p>
      </div>
    ),
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-label="How Neumas works"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            How it works
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            From receipt photo to
            <br />
            smart shopping list.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Five steps. No hardware. No manual entry. Just take a photo of your receipt and let Neumas do the rest.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
          Upload → Extract → Update → Predict → Shop · Typically under 60 seconds per receipt
        </p>
      </div>
    </section>
  );
}
