/* Server component — no interactivity needed */

const HOUSEHOLD_TYPES = [
  "Busy families",
  "Couples & flatmates",
  "Health-conscious households",
  "Budget-conscious households",
  "Health & wellness enthusiasts",
  "Households in Singapore",
  "Households in Malaysia",
];

export function TrustStrip() {
  return (
    <section
      id="trust"
      aria-label="Who Neumas is built for"
      className="border-y border-black/[0.05] bg-[#f5f5f7] px-5 py-12 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-center font-mono text-[11px] font-medium tracking-[0.15em] text-gray-400 uppercase">
          Built for households across Southeast Asia
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {HOUSEHOLD_TYPES.map((type) => (
            <span
              key={type}
              className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[12px] font-medium text-gray-600 shadow-sm"
            >
              {type}
            </span>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-[13px] leading-relaxed text-gray-500">
          From solo renters to multi-generation households, Neumas turns
          grocery receipts into living pantry intelligence — so you always
          know what you have and what to buy next.
        </p>
      </div>
    </section>
  );
}

