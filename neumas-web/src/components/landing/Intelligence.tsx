/* Server component */

export function Intelligence() {
  return (
    <section
      id="intelligence"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid items-start gap-16 lg:grid-cols-2">
          {/* Left: narrative */}
          <div>
            <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
              The AI layer
            </p>
            <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
              More than an
              <br />
              inventory app.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-gray-500">
              Neumas is not a glorified spreadsheet. Every document, every item,
              and every reorder recommendation runs through a reasoning layer
              that makes the logic transparent and auditable.
            </p>

            <div className="mt-8 space-y-5">
              {[
                {
                  title: "Vendor normalisation",
                  desc: "Dozens of names for the same supplier — \"Metro WS\", \"Metro Wholesale Pte\", \"Metro Trading\" — resolved to a single vendor profile automatically.",
                },
                {
                  title: "Confidence scoring",
                  desc: "Every extracted value carries a confidence score. Low-confidence items route to a human review queue before they touch your books.",
                },
                {
                  title: "Forecast reasoning",
                  desc: "Stockout predictions show the consumption pattern behind them: daily rate, days of stock remaining, and which outlet is at risk.",
                },
                {
                  title: "Price intelligence",
                  desc: "Reorder suggestions reference your real invoice history, not market averages — so the numbers your team sees are grounded in what you actually pay.",
                },
              ].map((item) => (
                <div key={item.title} className="border-l-2 border-[#0071a3]/20 pl-4">
                  <p className="text-[14px] font-semibold text-gray-800">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: product intelligence panels */}
          <div className="space-y-4">
            {/* Reasoning trace */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Forecast reasoning trace
              </p>
              <div className="rounded-xl border border-[#0071a3]/10 bg-[#f0f7fb] p-4">
                <p className="font-mono text-[11px] font-semibold text-[#0071a3]">
                  STOCKOUT_FORECAST · Chicken Breast · Outlet 2
                </p>
                <div className="mt-3 space-y-1.5 font-mono text-[11px] text-gray-600">
                  <p>
                    <span className="text-gray-400">current_qty:</span>{" "}
                    <span className="text-gray-800">18 units</span>
                  </p>
                  <p>
                    <span className="text-gray-400">avg_daily_consumption:</span>{" "}
                    <span className="text-gray-800">8.2 units / day</span>
                  </p>
                  <p>
                    <span className="text-gray-400">days_remaining:</span>{" "}
                    <span className="text-amber-600 font-semibold">2.2 days</span>
                  </p>
                  <p>
                    <span className="text-gray-400">pattern_window:</span>{" "}
                    <span className="text-gray-800">28-day history</span>
                  </p>
                  <p>
                    <span className="text-gray-400">confidence:</span>{" "}
                    <span className="text-[#0071a3] font-semibold">84%</span>
                  </p>
                  <p>
                    <span className="text-gray-400">action:</span>{" "}
                    <span className="text-gray-800">ALERT + REORDER_SUGGEST</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Vendor normalisation */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Vendor normalisation
              </p>
              <div className="space-y-2">
                {[
                  { raw: "Metro WS Pte", resolved: "Metro Wholesale Singapore", match: 96 },
                  { raw: "Fresh Direct (SG)", resolved: "Fresh Direct Singapore", match: 99 },
                  { raw: "Fish Mkt Jurong", resolved: "Jurong Fish Market", match: 88 },
                ].map((v) => (
                  <div key={v.raw} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                    <div>
                      <p className="text-[10px] text-gray-400 line-through">{v.raw}</p>
                      <p className="text-[12px] font-medium text-gray-800">{v.resolved}</p>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-emerald-600">{v.match}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price comparison */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
              <p className="mb-4 font-mono text-[10px] tracking-widest text-gray-400 uppercase">
                Price comparison · Chicken Breast 5 kg
              </p>
              <div className="space-y-2">
                {[
                  { vendor: "Metro Wholesale", price: "$31.50", trend: "−2.1%", best: true },
                  { vendor: "City Fresh Market", price: "$33.00", trend: "+0.4%", best: false },
                  { vendor: "Protein Direct SG", price: "$34.80", trend: "+3.2%", best: false },
                ].map((p) => (
                  <div
                    key={p.vendor}
                    className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${
                      p.best ? "bg-[#0071a3]/8 border border-[#0071a3]/15" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {p.best && (
                        <span className="rounded bg-[#0071a3] px-1.5 py-0.5 font-mono text-[9px] text-white">
                          BEST
                        </span>
                      )}
                      <p className="text-[12px] font-medium text-gray-800">{p.vendor}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[12px] font-semibold text-gray-800">{p.price}</p>
                      <p
                        className={`font-mono text-[10px] ${
                          p.trend.startsWith("−") ? "text-emerald-600" : "text-red-500"
                        }`}
                      >
                        {p.trend} vs avg
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
