"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "When is Neumas Control available?",
    a: "Neumas Control is currently in a closed pilot phase across Singapore, Malaysia, and the UAE. The 14-day pilot is open to qualified food operators now. We are targeting a full commercial launch in Q3 2026. Book a demo to be considered for the current wave.",
  },
  {
    q: "Do we need to change how our team works?",
    a: "No. Neumas fits into how your team already works. Receipts and invoices are uploaded by photo, PDF, or email forward — there is nothing new to learn. The AI handles extraction and normalisation in the background. Your team reviews flagged items in a simple queue.",
  },
  {
    q: "Does everything get auto-posted to inventory, or can we review first?",
    a: "Nothing posts to your inventory without a human checkpoint. Every document is processed with a confidence score. Items above your threshold are posted automatically. Items below it — or flagged for price variances — route to a review queue for your team to approve before anything changes.",
  },
  {
    q: "Does Neumas work across multiple outlets?",
    a: "Yes. Neumas is built for multi-outlet operators from the ground up. Each outlet has its own inventory, document stream, and alerts. Your management team gets a consolidated view across all properties. Role-based access means outlet staff only see their own site.",
  },
  {
    q: "How accurate is the AI extraction?",
    a: "Across our pilot operators, we see above 95% extraction accuracy on clean invoices and above 85% on handwritten receipts and delivery notes. Every extraction is confidence-scored. Low-confidence items always go to human review — so accuracy is never a silent risk.",
  },
  {
    q: "How does the 14-day pilot work?",
    a: "We run a structured two-week onboarding: your team is set up in Days 1–2, your first documents are processed in Days 3–5, live inventory and forecasts are active by Day 7, and you have a full weekly report and vendor spend analysis by Day 14. At the end, you decide whether to continue — no automatic charge, no pressure.",
  },
  {
    q: "Is any hardware or integration required?",
    a: "None. You upload documents by photo or PDF. There are no barcode scanners, POS integrations, or ERP connectors required to start. Integrations with existing systems are available for operators who want them, but they are never a prerequisite.",
  },
  {
    q: "Who should be using Neumas on our team?",
    a: "Typically your head of procurement, operations manager, or F&B director as the primary user. Outlet managers and purchasing staff use it to upload documents and action alerts. Your finance team uses it for spend reports and audit exports. No technical knowledge is required for any of these roles.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      id="faq"
      className="scroll-mt-24 bg-[#f5f5f7] px-5 py-28 sm:px-8"
    >
      <div className="mx-auto max-w-3xl">
        {/* Heading */}
        <div className="mb-12 text-center">
          <p className="mb-3 font-mono text-[11px] font-medium tracking-[0.15em] text-[#0071a3] uppercase">
            FAQ
          </p>
          <h2 className="text-[36px] font-bold leading-tight tracking-tight text-gray-900 sm:text-[44px]">
            Common questions.
          </h2>
        </div>

        {/* Accordion */}
        <div className="space-y-2">
          {FAQS.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpen(open === idx ? null : idx)}
                className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left"
                aria-expanded={open === idx}
              >
                <span className="text-[14px] font-semibold text-gray-900 leading-snug pr-2">
                  {item.q}
                </span>
                <ChevronDown
                  className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                    open === idx ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open === idx && (
                <div className="border-t border-gray-100 px-6 pb-5 pt-4">
                  <p className="text-[14px] leading-relaxed text-gray-500">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
