/* Server component */
import { Receipt, Globe, BrainCircuit, ShoppingCart } from "lucide-react";

const FEATURES = [
  {
    tag: "Receipt to stock",
    headline: "Invoices posted in minutes, not days.",
    body: "Neumas reads every receipt and invoice the moment it arrives — photo, PDF, or forwarded email. Line items are extracted, normalised, and posted to inventory without a single keystroke from your team.",
    bullets: [
      "AI extraction for any invoice format",
      "Automatic vendor and item normalisation",
      "Confidence scores with human review queue",
      "Audit trail for every change",
    ],
    visual: (
      <div className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-5">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          Document pipeline · Today
        </p>
        <div className="space-y-2">
          {[
            { name: "Fresh Direct Invoice #3182", status: "Posted", conf: 98, color: "text-emerald-600" },
            { name: "Metro Wholesale #8841", status: "Review", conf: 73, color: "text-amber-600" },
            { name: "Fish Market Receipt", status: "Posted", conf: 96, color: "text-emerald-600" },
            { name: "Bakery Delivery Note", status: "Extracting", conf: null, color: "text-[#0071a3]" },
          ].map((d) => (
            <div key={d.name} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
              <p className="text-[12px] font-medium text-gray-800">{d.name}</p>
              <div className="flex items-center gap-2">
                {d.conf !== null && (
                  <span className={`font-mono text-[11px] ${d.color}`}>{d.conf}%</span>
                )}
                <span className={`font-mono text-[10px] ${d.color}`}>{d.status}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-4 py-2 shadow-sm">
          <p className="text-[11px] text-gray-500">32 documents processed today</p>
          <span className="font-mono text-[10px] text-[#0071a3]">View all</span>
        </div>
      </div>
    ),
    icon: Receipt,
    flip: false,
  },
  {
    tag: "Live inventory",
    headline: "Every outlet. One view.",
    body: "Whether you run one kitchen or fifty, Neumas keeps live inventory counts across all your properties. Stock movements post in real time from every uploaded document, manually adjusted count, and confirmed delivery.",
    bullets: [
      "Real-time counts across all outlets",
      "Category, supplier, and location views",
      "Variance detection vs expected levels",
      "Role-based access per outlet",
    ],
    visual: (
      <div className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-5">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          Inventory · All outlets
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { outlet: "Outlet 1", items: 284, status: "green" },
            { outlet: "Outlet 2", items: 251, status: "amber" },
            { outlet: "Outlet 3", items: 198, status: "red" },
          ].map((o) => (
            <div key={o.outlet} className="rounded-xl bg-white p-3 shadow-sm text-center">
              <div
                className={`mx-auto mb-1 h-2 w-2 rounded-full ${
                  o.status === "green"
                    ? "bg-emerald-400"
                    : o.status === "amber"
                    ? "bg-amber-400"
                    : "bg-red-400"
                }`}
              />
              <p className="text-[11px] font-semibold text-gray-800">{o.items}</p>
              <p className="text-[10px] text-gray-400">{o.outlet}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {[
            { name: "Chicken Breast 5 kg", qty: 24, unit: "units", level: 82 },
            { name: "Heavy Cream 1 L", qty: 6, unit: "cartons", level: 18 },
            { name: "Pasta Penne 5 kg", qty: 31, unit: "bags", level: 94 },
          ].map((item) => (
            <div key={item.name} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm">
              <div className="flex-1">
                <p className="text-[11px] font-medium text-gray-800">{item.name}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      item.level > 60 ? "bg-emerald-400" : item.level > 30 ? "bg-amber-400" : "bg-red-400"
                    }`}
                    style={{ width: `${item.level}%` }}
                  />
                </div>
              </div>
              <span className="font-mono text-[10px] text-gray-500">
                {item.qty} {item.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    icon: Globe,
    flip: true,
  },
  {
    tag: "AI intelligence",
    headline: "Know before you run out.",
    body: "Neumas learns your consumption patterns and forecasts stockouts days in advance. Expiry risk is flagged automatically. Every prediction shows its confidence level and reasoning so your team always knows why.",
    bullets: [
      "Stockout forecasts up to 14 days ahead",
      "Expiry and waste risk alerts",
      "Confidence scores with reasoning trace",
      "Improves with every document processed",
    ],
    visual: (
      <div className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-5">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          AI forecast · Next 7 days
        </p>
        <div className="space-y-3">
          {[
            { item: "Chicken Breast", days: 2, conf: 84, risk: "HIGH" },
            { item: "Heavy Cream", days: 4, conf: 76, risk: "MEDIUM" },
            { item: "Salmon Fillet", days: 6, conf: 91, risk: "MEDIUM" },
          ].map((p) => (
            <div key={p.item} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800">{p.item}</p>
                  <p className="text-[10px] text-gray-400">Estimated stockout in {p.days} days</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold ${
                    p.risk === "HIGH"
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {p.risk}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      p.conf > 80 ? "bg-[#0071a3]" : "bg-cyan-400"
                    }`}
                    style={{ width: `${p.conf}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-gray-500">{p.conf}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    icon: BrainCircuit,
    flip: false,
  },
  {
    tag: "Reorder intelligence",
    headline: "Recommendations before you need to ask.",
    body: "When stock is running low, Neumas surfaces exactly what to order, from which vendor, and at what price — pulling from your own invoice history to compare prices intelligently.",
    bullets: [
      "Vendor price comparison from real invoices",
      "Suggested order quantities by consumption rate",
      "One-click reorder list for your purchasing team",
      "Spend analytics and vendor scorecards",
    ],
    visual: (
      <div className="rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-5">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
          Reorder plan · Outlet 1
        </p>
        <div className="space-y-2 mb-3">
          {[
            { vendor: "Metro Wholesale", items: "Chicken Breast, Cream", value: "$820", tag: "Best price" },
            { vendor: "Fresh Direct SG", items: "Salmon, Sea Bass", value: "$640", tag: "Preferred" },
          ].map((r) => (
            <div key={r.vendor} className="rounded-xl bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-gray-800">{r.vendor}</p>
                  <p className="text-[10px] text-gray-400">{r.items}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[12px] font-semibold text-gray-800">{r.value}</p>
                  <span className="rounded-full bg-[#0071a3]/10 px-1.5 py-0.5 font-mono text-[9px] text-[#0071a3]">
                    {r.tag}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="w-full rounded-xl bg-[#0071a3] py-2.5 text-center font-mono text-[11px] font-semibold text-white"
        >
          Send reorder list to team
        </button>
      </div>
    ),
    icon: ShoppingCart,
    flip: true,
  },
] as const;

export function ValueStack() {
  return (
    <section
      id="value-stack"
      className="scroll-mt-24 px-5 py-24 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            What you get
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Everything your procurement
            <br />
            team needs.
          </h2>
        </div>

        <div className="mt-20 space-y-24">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.tag}
                className={`grid items-center gap-12 lg:grid-cols-2 ${
                  feature.flip ? "lg:[direction:rtl]" : ""
                }`}
              >
                {/* Text */}
                <div className="lg:[direction:ltr]">
                  <div className="mb-4 inline-flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0071a3]/10">
                      <Icon className="h-4 w-4 text-[#0071a3]" />
                    </div>
                    <span className="font-mono text-[11px] font-medium tracking-widest text-[#0071a3] uppercase">
                      {feature.tag}
                    </span>
                  </div>
                  <h3 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[30px]">
                    {feature.headline}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-gray-500">{feature.body}</p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-[14px] text-gray-600">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0071a3]" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Visual */}
                <div className="lg:[direction:ltr]">{feature.visual}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
