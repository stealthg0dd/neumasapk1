/* Server component */

const USE_CASES = [
  {
    icon: "👨‍👩‍👧‍👦",
    title: "Busy families",
    headline: "Never run out of essentials again.",
    body: "Between school runs, work, and activities, nobody has time to audit the pantry before every shop. Neumas tracks everything automatically and tells you exactly what to buy — so you're never caught without rice, cooking oil, or the kids' snacks.",
    proof: "Households with 3+ members save an average of 2 trips per month.",
  },
  {
    icon: "👫",
    title: "Couples & flatmates",
    headline: "One shared pantry, zero confusion.",
    body: "Stop the \"did you buy eggs?\" messages. Neumas gives everyone in the household a shared, real-time view of what's in the pantry and what needs to be bought. Coordinate your shop without the back-and-forth.",
    proof: "Works for households of any size — shared access, shared lists.",
  },
  {
    icon: "🥦",
    title: "Health-conscious households",
    headline: "Always have what you need for clean eating.",
    body: "When you're meal-prepping or following a specific diet, running out of a key ingredient derails everything. Neumas tracks your fresh produce and protein so your fridge is always stocked for the week ahead.",
    proof: "Track macros by category — protein, produce, dairy, and more.",
  },
  {
    icon: "💰",
    title: "Budget-conscious households",
    headline: "Know exactly where your grocery money goes.",
    body: "Neumas builds a full picture of your household spending over time — by retailer, category, and item. Spot where you're overspending, reduce duplicates, and cut food waste. Most households find savings within the first month.",
    proof: "Average household identifies $30–80 / month in avoidable grocery waste.",
  },
  {
    icon: "🏪",
    title: "Retail & CPG pilots",
    headline: "Understand real household consumption at scale.",
    body: "For retailers and consumer brands exploring Southeast Asian households, Neumas provides ground-truth consumption data — what households actually buy, at what frequency, across Singapore, Malaysia, and the region.",
    proof: "Anonymised, consent-based consumption intelligence for market research.",
  },
] as const;

export function UseCases() {
  return (
    <section
      id="use-cases"
      aria-label="Who Neumas is for"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            Who it&apos;s for
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Every kind of household
            <br />
            runs better with Neumas.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Whether you&apos;re feeding a family of five or living with flatmates,
            Neumas turns your grocery habits into intelligent, automatic pantry management.
          </p>
        </div>

        {/* Use case cards */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.slice(0, 3).map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl border border-black/[0.06] bg-white p-7 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl" role="img" aria-label={uc.title}>{uc.icon}</span>
                <span className="font-mono text-[11px] font-medium tracking-widest text-[#0071a3] uppercase">
                  {uc.title}
                </span>
              </div>
              <h3 className="text-[17px] font-semibold text-gray-900">{uc.headline}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-gray-500">{uc.body}</p>
              <div className="mt-5 rounded-xl bg-[#f0f7fb] px-4 py-3">
                <p className="text-[12px] leading-relaxed text-[#0071a3]">{uc.proof}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom two — wider layout */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {USE_CASES.slice(3).map((uc) => (
            <div
              key={uc.title}
              className="rounded-2xl border border-black/[0.06] bg-white p-7 shadow-sm"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl" role="img" aria-label={uc.title}>{uc.icon}</span>
                <span className="font-mono text-[11px] font-medium tracking-widest text-[#0071a3] uppercase">
                  {uc.title}
                </span>
              </div>
              <h3 className="text-[17px] font-semibold text-gray-900">{uc.headline}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-gray-500">{uc.body}</p>
              <div className="mt-5 rounded-xl bg-[#f0f7fb] px-4 py-3">
                <p className="text-[12px] leading-relaxed text-[#0071a3]">{uc.proof}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
