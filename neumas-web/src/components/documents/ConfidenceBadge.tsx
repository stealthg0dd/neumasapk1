/**
 * ConfidenceBadge — displays an OCR/AI confidence score as a coloured badge.
 */
"use client";

interface ConfidenceBadgeProps {
  /** Confidence score in range [0, 1] */
  confidence: number;
  /** Threshold below which the badge turns orange/red */
  reviewThreshold?: number;
}

export function ConfidenceBadge({ confidence, reviewThreshold = 0.75 }: ConfidenceBadgeProps) {
  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.9
      ? "bg-green-100 text-green-700"
      : confidence >= reviewThreshold
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
      title={`Confidence: ${pct}%`}
    >
      {pct}%
    </span>
  );
}
