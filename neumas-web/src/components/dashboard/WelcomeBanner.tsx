"use client";

import { useEffect, useState } from "react";
import { X, Upload, FileCheck, BarChart2, UserPlus, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const STORAGE_KEY = "neumas_welcome_dismissed";

const MILESTONES = [
  {
    id: "upload",
    icon: Upload,
    label: "Upload your first invoice",
    desc: "Populates live inventory instantly",
    href: "/dashboard/documents",
    cta: "Upload now",
  },
  {
    id: "review",
    icon: FileCheck,
    label: "Review & approve a document",
    desc: "Confirms extracted line items",
    href: "/dashboard/documents",
    cta: "Open review queue",
  },
  {
    id: "report",
    icon: BarChart2,
    label: "Generate your first report",
    desc: "Full weekly procurement summary",
    href: "/dashboard/reports",
    cta: "Generate report",
  },
  {
    id: "invite",
    icon: UserPlus,
    label: "Invite a teammate",
    desc: "Ops manager, procurement lead, or admin",
    href: "/dashboard/admin",
    cta: "Invite now",
  },
] as const;

type MilestoneId = (typeof MILESTONES)[number]["id"];

const COMPLETED_KEY = "neumas_completed_milestones";

function loadCompleted(): MilestoneId[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(COMPLETED_KEY) ?? "[]") as MilestoneId[];
  } catch {
    return [];
  }
}

export function WelcomeBanner({ scanCount }: { scanCount: number }) {
  const [show, setShow] = useState(false);
  const [completed, setCompleted] = useState<MilestoneId[]>([]);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    setShow(!dismissed);
    setCompleted(loadCompleted());
    // Auto-mark upload if scans already exist
    if (scanCount > 0) {
      const prev = loadCompleted();
      if (!prev.includes("upload")) {
        const next = [...prev, "upload"] as MilestoneId[];
        setCompleted(next);
        localStorage.setItem(COMPLETED_KEY, JSON.stringify(next));
      }
    }
  }, [scanCount]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  const remaining = MILESTONES.filter((m) => !completed.includes(m.id));
  const doneCount = completed.length;

  return (
    <div className="rounded-2xl border border-[#0071a3]/15 bg-gradient-to-br from-[#f0f7fb] to-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
              Getting started
            </span>
            <span className="rounded-full bg-[#0071a3]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0071a3]">
              {doneCount} / {MILESTONES.length} complete
            </span>
          </div>
          <h2 className="text-[16px] font-bold text-gray-900">
            {doneCount === 0
              ? "Complete these steps to unlock full value"
              : doneCount === MILESTONES.length
              ? "You're fully set up — great work!"
              : `${MILESTONES.length - doneCount} step${MILESTONES.length - doneCount !== 1 ? "s" : ""} to go`}
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {remaining.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {remaining.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-xl border border-black/[0.06] bg-white p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#f0f7fb]">
                  <Icon className="h-4 w-4 text-[#0071a3]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800">{m.label}</p>
                  <p className="text-[11px] text-gray-400">{m.desc}</p>
                </div>
                <Link
                  href={m.href}
                  className="shrink-0 rounded-lg bg-[#0071a3] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#005f8a] transition-colors"
                >
                  {m.cta}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {MILESTONES.filter((m) => completed.includes(m.id)).map((m) => (
            <span
              key={m.id}
              className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700"
            >
              <CheckCircle2 className="h-3 w-3" />
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
