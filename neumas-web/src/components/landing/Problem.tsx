/* Server component */

const PAINS = [
  {
    num: "01",
    title: "Forgotten pantry items",
    body: "You buy soy sauce, fish sauce, or cooking oil again — only to find three bottles already at home. Without visibility into what you actually have, duplicate purchases happen every shop.",
    stat: "1 in 3",
    statLabel: "grocery purchases is a duplicate item",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Last 4 purchases · Soy sauce</p>
        <div className="space-y-1.5">
          {[
            { date: "12 May", qty: "1 bottle", tag: "Duplicate" },
            { date: "28 Apr", qty: "1 bottle", tag: "Duplicate" },
            { date: "14 Apr", qty: "1 bottle", tag: "" },
          ].map((r) => (
            <div key={r.date} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] text-gray-700">{r.date} — {r.qty}</p>
              {r.tag && (
                <span className="font-mono text-[9px] text-red-400">{r.tag}</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-red-400">~$12 wasted on duplicates this month</p>
      </div>
    ),
  },
  {
    num: "02",
    title: "Expired groceries",
    body: "Items get pushed to the back of the fridge or pantry and expire before you use them. You don't realise until they're already wasted — money straight in the bin.",
    stat: "15–20%",
    statLabel: "of household groceries are thrown away unused",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Pantry · Expiry risk</p>
        <div className="space-y-2">
          {[
            { name: "Greek Yogurt", status: "Expiring today", bar: 5, color: "bg-red-400" },
            { name: "Fresh Milk 1L", status: "2 days", bar: 15, color: "bg-amber-400" },
            { name: "Spinach bag", status: "3 days", bar: 25, color: "bg-amber-300" },
          ].map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-gray-700">{r.name}</p>
                <span className="font-mono text-[9px] text-red-500">{r.status}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.bar}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "03",
    title: "No spending visibility",
    body: "How much did you actually spend on groceries last month? Which items do you buy most? Without tracking, there's no way to budget, reduce waste, or understand your household's patterns.",
    stat: "4×",
    statLabel: "the budgeted grocery spend without tracking",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Monthly spend breakdown</p>
        <div className="space-y-2">
          {[
            { cat: "Fresh produce", pct: 34, color: "bg-emerald-400" },
            { cat: "Protein", pct: 28, color: "bg-[#0071a3]" },
            { cat: "Dry goods", pct: 22, color: "bg-cyan-400" },
            { cat: "Beverages", pct: 16, color: "bg-gray-300" },
          ].map((c) => (
            <div key={c.cat} className="flex items-center gap-3">
              <p className="w-28 text-[11px] text-gray-600 shrink-0">{c.cat}</p>
              <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className={`h-full rounded-full ${c.color}`} style={{ width: `${c.pct * 2.5}%` }} />
              </div>
              <p className="font-mono text-[10px] text-gray-400 w-8 text-right">{c.pct}%</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "04",
    title: "Manual shopping lists",
    body: "Every week you write a shopping list from scratch — walking through the kitchen, trying to remember what's running low. It's slow, error-prone, and you still forget things.",
    stat: "45 min",
    statLabel: "spent per week on manual grocery planning",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">WhatsApp · Family group</p>
        <div className="space-y-2">
          {[
            { msg: "Can someone check if we have eggs?", me: false },
            { msg: "I think so? Not sure", me: false },
            { msg: "Just buy them to be safe", me: true },
            { msg: "We already have 18 eggs lol", me: false },
          ].map((m, i) => (
            <div key={i} className={`flex ${m.me ? "justify-end" : "justify-start"}`}>
              <p className={`rounded-xl px-3 py-1.5 text-[11px] max-w-[80%] ${m.me ? "bg-[#0071a3] text-white" : "bg-gray-100 text-gray-700"}`}>
                {m.msg}
              </p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: "05",
    title: "No consumption intelligence",
    body: "How fast does your household go through rice? When do you typically restock chicken? Without data, every shop is a guess — and you end up buying too much of some things and too little of others.",
    stat: "0%",
    statLabel: "of households track their consumption patterns",
    visual: (
      <div className="rounded-xl border border-black/[0.06] bg-white p-4 shadow-sm">
        <p className="mb-2 font-mono text-[10px] tracking-widest text-gray-400 uppercase">Rice (5kg) · Consumption history</p>
        <div className="flex items-end gap-1 h-14">
          {[60, 80, 55, 90, 70, 85, 65, 75, 80, 70, 90, 60].map((h, i) => (
            <div key={i} className="flex-1 flex items-end">
              <div
                className="w-full rounded-sm bg-[#0071a3]/20"
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-gray-400">12-week consumption pattern · No baseline</p>
      </div>
    ),
  },
] as const;

export function Problem() {
  return (
    <section
      id="problem"
      aria-label="Problems Neumas solves"
      className="scroll-mt-24 px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            The problem
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Grocery shopping is still
            <br />
            a blind guessing game.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            Most households have no idea what&apos;s in their pantry, what they&apos;re
            spending, or when they&apos;ll run out of essentials. Neumas fixes that.
          </p>
        </div>

        {/* Pain cards — 3 columns on desktop, 2 on tablet, 1 on mobile */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
