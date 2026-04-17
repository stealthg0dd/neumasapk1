/* Server component */

const PAINS = [
  {
    num: "01",
    title: "Manual receipt entry",
    body:
      "Staff re-key every invoice by hand. Data lags days behind reality, errors go undetected, and your finance team reconciles spreadsheets instead of making decisions.",
    stat: "3–5 hours",
    statLabel: "lost per outlet per week",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        {/* Simulated manual entry table */}
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] tracking-widest text-gray-400 uppercase">Manual entry — Invoice #2847</p>
          <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[9px] text-red-500">Unverified</span>
        </div>
        <div className="space-y-1.5">
          {[
            { name: "Chicken (5kg)", entered: "6", actual: "8" },
            { name: "Olive Oil 1L", entered: "??", actual: "12" },
            { name: "Salmon Fillet", entered: "4", actual: "4" },
          ].map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-700">{r.name}</p>
              <div className="flex items-center gap-2">
                {r.entered !== r.actual && (
                  <span className="text-[10px] text-red-400 line-through">{r.entered}</span>
                )}
                <span className="font-mono text-[11px] font-medium text-gray-900">{r.actual}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-red-400">2 data errors detected</p>
      </div>
    ),
  },
  {
    num: "02",
    title: "Late stock visibility",
    body:
      "You discover you're out of an ingredient when service is already underway. Procurement decisions are made on gut feel and outdated counts, not live data.",
    stat: "48–72 hrs",
    statLabel: "average inventory lag",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Last count: 3 days ago</p>
        <div className="space-y-2">
          {[
            { name: "Beef Tenderloin", status: "UNKNOWN", bar: 0 },
            { name: "Heavy Cream", status: "CRITICAL", bar: 8 },
            { name: "Arborio Rice", status: "UNKNOWN", bar: 0 },
          ].map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-gray-700">{r.name}</p>
                <span
                  className={`font-mono text-[9px] ${
                    r.status === "CRITICAL" ? "text-red-500" : "text-gray-300"
                  }`}
                >
                  {r.status}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-red-300"
                  style={{ width: `${r.bar}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-amber-500">Running blind on 2 critical items</p>
      </div>
    ),
  },
  {
    num: "03",
    title: "Reactive reordering",
    body:
      "Orders are placed after stockouts happen, not before. Emergency purchases cost more, preferred vendors miss lead times, and waste from over-ordering eats margin.",
    stat: "15–25%",
    statLabel: "margin lost to reactive buying",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-3 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Reorder log · last 7 days</p>
        <div className="space-y-2">
          {[
            { label: "Emergency order — Salmon", cost: "+$340 premium", type: "EMERGENCY" },
            { label: "Over-order — Mushrooms", cost: "$180 written off", type: "WASTE" },
            { label: "Late reorder — Cream", cost: "Service disruption", type: "MISS" },
          ].map((r) => (
            <div key={r.label} className="flex items-start justify-between rounded-lg bg-red-50 px-3 py-2">
              <p className="text-[11px] text-gray-700">{r.label}</p>
              <div className="text-right">
                <p className="font-mono text-[10px] text-red-500">{r.cost}</p>
                <span className="font-mono text-[9px] text-red-400">{r.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
] as const;

export function Problem() {
  return (
    <section
      id="problem"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            The status quo
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Procurement is still
            <br />
            painfully manual.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Food operators lose hours, margin, and mental bandwidth every week
            to processes that should have been automated years ago.
          </p>
        </div>

        {/* Pain cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {PAINS.map((pain) => (
            <div
              key={pain.num}
              className="group rounded-2xl border border-black/[0.06] bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="font-mono text-[32px] font-bold text-gray-100 transition-colors group-hover:text-[#0071a3]/20">
                {pain.num}
              </p>
              <h3 className="mt-2 text-[17px] font-semibold text-gray-900">{pain.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-gray-500">{pain.body}</p>

              {/* Stat */}
              <div className="my-5 rounded-xl bg-[#f5f5f7] px-4 py-3">
                <p className="text-[22px] font-bold text-gray-900">{pain.stat}</p>
                <p className="text-[12px] text-gray-500">{pain.statLabel}</p>
              </div>

              {/* Visual fragment */}
              {pain.visual}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
