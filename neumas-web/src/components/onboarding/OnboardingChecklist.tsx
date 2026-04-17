/**
 * OnboardingChecklist — progressive checklist shown to new operators.
 *
 * Items are checked off as the user completes each setup step.
 */
"use client";

import { useState } from "react";

export interface OnboardingStep {
  id: string;
  label: string;
  description?: string;
  href?: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  steps: OnboardingStep[];
  onDismiss?: () => void;
}

export function OnboardingChecklist({ steps, onDismiss }: OnboardingChecklistProps) {
  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <div className="border border-blue-100 rounded-xl bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-900">Get started</p>
          <p className="text-xs text-blue-700 mt-0.5">
            {completedCount} of {steps.length} steps complete
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-blue-400 hover:text-blue-600 text-xs"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-blue-200 rounded-full h-1.5">
        <div
          className="bg-blue-600 h-1.5 rounded-full transition-all"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                step.completed
                  ? "border-blue-600 bg-blue-600"
                  : "border-blue-300 bg-white"
              }`}
            >
              {step.completed && (
                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </span>
            <div className="flex-1 min-w-0">
              {step.href && !step.completed ? (
                <a href={step.href} className="text-sm font-medium text-blue-800 hover:underline">
                  {step.label}
                </a>
              ) : (
                <p className={`text-sm font-medium ${step.completed ? "text-blue-500 line-through" : "text-blue-800"}`}>
                  {step.label}
                </p>
              )}
              {step.description && !step.completed && (
                <p className="text-xs text-blue-600 mt-0.5">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
