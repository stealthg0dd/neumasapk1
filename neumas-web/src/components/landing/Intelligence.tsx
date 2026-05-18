/* Server component */

export function Intelligence() {
  return (
    <section
      id="intelligence"
      aria-label="How Neumas AI learns your household"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid items-start gap-16 lg:grid-cols-2">
          {/* Left: narrative */}
          <div>
            <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
              The AI intelligence layer
            </p>
            <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
              Neumas learns your
              <br />
              household over time.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-gray-500">
              Every receipt you scan teaches Neumas more about how your household
              actually lives. Over weeks and months, the predictions get sharper,
              the shopping list gets more accurate, and the waste gets lower.
            </p>

            <div className="mt-8 space-y-5">
              {[
                {
                  title: "Consumption patterns",
                  desc: "Neumas tracks how fast each item is used in your home — whether it's 2 days for milk or 3 weeks for soy sauce — and uses that to predict exactly when you'll run out.",
                },
                {
                  title: "Seasonal adjustments",
                  desc: "During school holidays, festive seasons, or when guests visit, Neumas detects shifts in your purchase volume and adjusts its forecasts automatically.",
                },
                {
                  title: "Brand and preference memory",
                  desc: "Your household's preferences are remembered. If you always buy a specific brand of cooking oil, Neumas puts that brand on your list — not a generic suggestion.",
                },
                {
                  title: "Waste pattern detection",
                  desc: "If certain items consistently expire before you finish them, Neumas flags it and suggests smaller quantities next time — reducing waste and saving money.",
                },
              ].map((item) => (
                <div key={item.title} className="border-l-2 border-[#0071a3]/20 pl-4">
                  <p className="text-[14px] font-semibold text-gray-800">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: AI intelligence panels */}
          <div className="space-y-4">
            {/* Consumption trace */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Consumption model · Cooking Oil 2L
              </p>
              <div className="rounded-xl border border-[#0071a3]/10 bg-[#f0f7fb] p-4">
                <p className="font-mono text-[11px] font-semibold text-[#0071a3]">
                  STOCKOUT_FORECAST · Cooking Oil · Home
                </p>
                <div className="mt-3 space-y-1.5 font-mono text-[11px] text-gray-600">
                  <p>
                    <span className="text-gray-400">purchased:</span>{" "}
                    <span className="text-gray-800">12 May · 1 bottle</span>
                  </p>
                  <p>
                    <span className="text-gray-400">avg_daily_use:</span>{" "}
                    <span className="text-gray-800">0.3 uses / day</span>
                  </p>
                  <p>
                    <span className="text-gray-400">days_remaining:</span>{" "}
                    <span className="text-amber-600 font-semibold">3.1 days</span>
                  </p>
                  <p>
                    <span className="text-gray-400">confidence:</span>{" "}
                    <span className="text-[#0071a3] font-semibold">91%</span>
                  </p>
                  <p>
                    <span className="text-gray-400">action:</span>{" "}
                    <span className="text-gray-800">ADD_TO_SHOPPING_LIST</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Household pattern */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Household pattern · Eggs ×30
              </p>
              <div className="space-y-2">
                {[
                  { week: "Week 1", qty: "30 eggs", rate: "5.1 / day" },
                  { week: "Week 2", qty: "30 eggs", rate: "5.3 / day" },
                  { week: "Week 3 (school hols)", qty: "30 eggs", rate: "7.2 / day" },
                  { week: "Week 4", qty: "30 eggs", rate: "5.0 / day" },
                ].map((row) => (
                  <div key={row.week} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${row.week.includes("hols") ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}>
                    <div>
                      <p className="text-[11px] font-medium text-gray-800">{row.week}</p>
                      <p className="text-[10px] text-gray-400">{row.qty} purchased</p>
                    </div>
                    <span className={`font-mono text-[11px] font-semibold ${row.week.includes("hols") ? "text-amber-600" : "text-gray-600"}`}>
                      {row.rate}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] text-[#0071a3]">Seasonal spike detected → adjusted forecast</p>
            </div>

            {/* Preference memory */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Brand preference · Rice
              </p>
              <div className="space-y-2">
                {[
                  { brand: "Jasmine Gold 5kg", freq: "7 of 8 purchases", match: 88 },
                  { brand: "Sun Moon 5kg", freq: "1 of 8 purchases", match: 12 },
                ].map((b) => (
                  <div key={b.brand} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                    <div>
                      <p className="text-[12px] font-medium text-gray-800">{b.brand}</p>
                      <p className="text-[10px] text-gray-400">{b.freq}</p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-emerald-600">{b.match}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] text-[#0071a3]">Shopping list will recommend: Jasmine Gold 5kg</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
