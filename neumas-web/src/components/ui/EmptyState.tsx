import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  body: string;
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  badge?: string;
}

export function EmptyState({
  icon: Icon,
  headline,
  body,
  cta,
  secondaryCta,
  badge,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-black/[0.06] bg-white px-8 py-14 text-center shadow-sm">
      {badge && (
        <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#0071a3]/20 bg-[#f0f7fb] px-3 py-1.5 text-[11px] font-semibold tracking-widest text-[#0071a3] uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0071a3]" />
          {badge}
        </span>
      )}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f0f7fb]">
        <Icon className="h-7 w-7 text-[#0071a3]" />
      </div>
      <h3 className="text-[18px] font-bold text-gray-900">{headline}</h3>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-gray-500">{body}</p>
      {(cta || secondaryCta) && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {cta && (
            <Link
              href={cta.href}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0071a3] px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#005f8a]"
            >
              {cta.label}
            </Link>
          )}
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-2.5 text-[13px] font-medium text-gray-600 transition-all hover:bg-gray-50"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
