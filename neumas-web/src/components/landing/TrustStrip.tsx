/* Server component — no interactivity needed */

const OPERATORS = [
  "Restaurant Groups",
  "Central Kitchens",
  "Hotel F&B",
  "Catering Operators",
  "Food Courts",
  "Multi-Outlet Chains",
];

export function TrustStrip() {
  return (
    <section
      id="trust"
      className="border-y border-black/[0.05] bg-[#f5f5f7] px-5 py-12 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-center font-mono text-[11px] font-medium tracking-[0.15em] text-gray-400 uppercase">
          Built for professional food operators
        </p>

        {/* Operator type pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {OPERATORS.map((op) => (
            <span
              key={op}
              className="rounded-full border border-black/[0.08] bg-white px-4 py-1.5 text-[12px] font-medium text-gray-600 shadow-sm"
            >
              {op}
            </span>
          ))}
        </div>

        {/* Logo placeholder strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-8 sm:gap-14">
          {["Partner A", "Partner B", "Partner C", "Partner D", "Partner E"].map((name) => (
            <div
              key={name}
              className="flex h-8 w-24 items-center justify-center rounded-md bg-gray-200/70"
              aria-label={`${name} logo placeholder`}
            >
              {/* Replace with <Image src="…" alt="…" /> when brand assets are available */}
              <span className="font-mono text-[10px] text-gray-400">{name}</span>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-[13px] leading-relaxed text-gray-500">
          From single-site restaurants to 50-outlet chains, Neumas Control gives
          your procurement team complete visibility without adding headcount.
        </p>
      </div>
    </section>
  );
}
