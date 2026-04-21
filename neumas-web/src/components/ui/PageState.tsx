"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PageLoadingState({
  title = "Loading…",
  message = "Please wait while we fetch the latest data.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-black/[0.06] bg-white px-8 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f7fb]">
        <Loader2 className="h-6 w-6 animate-spin text-[#0071a3]" />
      </div>
      <h3 className="text-[18px] font-bold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-gray-500">{message}</p>
    </div>
  );
}

export function PageErrorState({
  title = "Something went wrong",
  message = "We couldn't load this page right now. Please try again.",
  retryLabel = "Try again",
  onRetry,
}: {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-8 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
        <AlertTriangle className="h-6 w-6 text-red-600" />
      </div>
      <h3 className="text-[18px] font-bold text-gray-900">{title}</h3>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-gray-600">{message}</p>
      {onRetry && (
        <Button
          type="button"
          onClick={onRetry}
          className="mt-6 bg-[#0071a3] text-white hover:bg-[#005f8a]"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
