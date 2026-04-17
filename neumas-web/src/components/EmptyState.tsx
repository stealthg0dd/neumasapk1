import React from "react";

export default function EmptyState({
  icon,
  badge,
  headline,
  body,
  cta,
}: {
  icon: React.ReactNode;
  badge?: string;
  headline: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-white/80 rounded-xl shadow">
      <div className="mb-4 text-5xl">{icon}</div>
      {badge && <span className="mb-2 px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">{badge}</span>}
      <h3 className="text-xl font-bold mb-2 text-gray-900">{headline}</h3>
      <p className="text-gray-700 mb-4 text-center max-w-xs">{body}</p>
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
