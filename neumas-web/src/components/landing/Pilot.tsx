/* Server component */
import { CheckCircle2 } from "lucide-react";

const INCLUDED = [
  "Full platform access for your team",
  "Onboarding call with a Neumas specialist",
  "Document pipeline set up and tested",
  "Up to 3 outlets connected",
  "Inventory baseline established from existing records",
  "First AI forecasts live within 7 days",
  "Export-ready weekly report by Day 14",
  "No hardware, no integrations, no IT team required",
];

const TIMELINE = [
  { day: "Day 1–2", title: "Setup & onboarding", desc: "Accounts created, outlets configured, team invited." },
  { day: "Day 3–5", title: "First documents in", desc: "Upload your first batch of invoices and receipts. AI begins learning." },
  { day: "Day 7", title: "Live inventory", desc: "Real inventory counts flowing from documents. First forecasts generated." },
  { day: "Day 14", title: "Full picture", desc: "Weekly report, vendor spend analysis, and a decision on continuing." },
];

export function Pilot() {
  return (
    <section
      id="pilot"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Heading */}
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            Get started
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            14-day pilot.
            <br />
            Zero friction.
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-gray-500">
            We run a focused two-week pilot so your team can see the value before any commercial decision. No
            hardware. No long-form procurement process. No IT dependencies.
          </p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Timeline */}
          <div>
            <p className="mb-6 font-mono text-[11px] font-medium tracking-widest text-gray-400 uppercase">
              What happens in 14 days
            </p>
            <div className="relative space-y-0">
              {TIMELINE.map((step, idx) => (
                <div key={step.day} className="relative flex gap-5 pb-8 last:pb-0">
                  {/* Line */}
                  {idx < TIMELINE.length - 1 && (
                    <div className="absolute left-[11px] top-6 h-full w-px bg-gray-200" />
                  )}
                  {/* Dot */}
                  <div className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#0071a3] bg-white">
                    <span className="h-2 w-2 rounded-full bg-[#0071a3]" />
                  </div>
                  {/* Content */}
                  <div className="-mt-0.5">
                    <p className="font-mono text-[10px] font-medium tracking-widest text-[#0071a3] uppercase">
                      {step.day}
                    </p>
                    <p className="mt-0.5 text-[14px] font-semibold text-gray-900">{step.title}</p>
                    <p className="mt-1 text-[13px] text-gray-500">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Included */}
          <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-black/[0.05]">
            <p className="mb-5 font-mono text-[11px] font-medium tracking-widest text-gray-400 uppercase">
              What's included
            </p>
            <ul className="space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[14px] text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-xl border border-[#0071a3]/15 bg-[#f0f7fb] p-4">
              <p className="text-[13px] font-semibold text-[#0071a3]">
                At the end of 14 days, you decide.
              </p>
              <p className="mt-1 text-[12px] text-gray-500">
                No automatic charge. No pressure. We're confident the results speak for themselves.
              </p>
            </div>
            <a
              href="/auth"
              className="mt-5 flex w-full items-center justify-center rounded-xl bg-[#0071a3] py-3.5 text-[14px] font-semibold text-white shadow-md shadow-[#0071a3]/20 transition-all hover:bg-[#005f8a] hover:shadow-lg"
            >
              Start your 14-day pilot
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
