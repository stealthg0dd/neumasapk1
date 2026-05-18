/* Server component */
import { Receipt, Package, TrendingDown, ShoppingCart, BarChart3, Leaf, Users, Store } from "lucide-react";

const FEATURES = [
  {
    icon: Receipt,
    title: "Receipt intelligence",
    body: "Scan any grocery receipt — physical or digital — and Neumas extracts every item, quantity, and price in seconds. No manual entry, ever.",
  },
  {
    icon: Package,
    title: "Pantry inventory",
    body: "Your digital pantry always reflects what you actually have at home. Items are tracked from purchase to consumption, automatically.",
  },
  {
    icon: TrendingDown,
    title: "Stockout prediction",
    body: "Neumas calculates when each item will run out based on your household's real consumption rate — days before it happens.",
  },
  {
    icon: ShoppingCart,
    title: "Smart shopping list",
    body: "Your weekly shopping list is generated automatically, sorted by urgency and personalised to your household's consumption patterns.",
  },
  {
    icon: BarChart3,
    title: "Spending insights",
    body: "Understand exactly how much your household spends on groceries — by category, retailer, and week — and where you can save.",
  },
  {
    icon: Leaf,
    title: "Waste reduction",
    body: "Get expiry warnings before items go bad. Neumas helps you use what you have before buying more — saving money and reducing food waste.",
  },
  {
    icon: Users,
    title: "Household analytics",
    body: "Track consumption trends across your whole household over weeks and months. Understand what your family actually eats.",
  },
  {
    icon: Store,
    title: "Retailer & vendor insights",
    body: "See which supermarkets you buy from most, compare prices over time, and spot the best deals on your regular items.",
  },
] as const;

export function ValueStack() {
  return (
    <section
      id="value-stack"
      aria-label="Neumas features"
      className="scroll-mt-24 px-5 py-24 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            Features
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Everything your household
            <br />
            needs to stay stocked.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Eight capabilities that turn your receipts into a living intelligence
            layer for your home.
          </p>
        </div>

        {/* Feature grid */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#0071a3]/10 transition-colors group-hover:bg-[#0071a3]/20">
                  <Icon className="h-5 w-5 text-[#0071a3]" />
                </div>
                <h3 className="text-[15px] font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-500">{feature.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
