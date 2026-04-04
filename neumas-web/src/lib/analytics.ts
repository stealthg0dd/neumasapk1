/**
 * Neumas Analytics — PostHog typed wrapper
 *
 * Provides:
 *  - PostHog singleton initialised once (browser-only)
 *  - Typed `track()` for all product events
 *  - `identifyUser()` / `resetAnalytics()` for auth lifecycle
 *  - `captureUIError()` — shows a sonner toast AND captures to Sentry,
 *    replacing the `toast.error()` pattern in every catch block
 */

"use client";

import posthog from "posthog-js";
import * as Sentry from "@sentry/nextjs";
import { toast } from "sonner";

// ── Initialisation ─────────────────────────────────────────────────────────────

export function initPostHog(): void {
  if (typeof window === "undefined") return;
  if (posthog.__loaded) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // silently skip in local dev when key is not configured

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    // Disable the automatic pageview — we fire page_viewed manually so we
    // can include our own page_name property.
    capture_pageview: false,
    // Session recording: enabled on all sessions
    session_recording: {
      maskAllInputs: true, // never record passwords / sensitive fields
    },
    // Feature flags: bootstrap from next request, poll every 30 s
    bootstrap: {},
    feature_flag_request_timeout_ms: 3000,
  });
}

// ── Typed event catalogue ───────────────────────────────────────────────────────

export type NeumasEvent =
  | { event: "page_viewed";              props: { page_name: string; path: string } }
  | { event: "user_signed_in";           props: { email: string } }
  | { event: "user_signed_out";          props?: Record<string, never> }
  | { event: "item_scanned";             props: { method: string; item_count: number; scan_id?: string } }
  | { event: "scan_upload_failed";       props: { method: string; error: string } }
  | { event: "inventory_updated";        props: { action: "add" | "remove" | "update"; item_count: number; item_name?: string } }
  | { event: "forecast_triggered";       props: { window_days: number } }
  | { event: "predictions_loaded";       props: { total: number; critical: number; urgent: number } }
  | { event: "shopping_list_generated";  props: { critical_only: boolean; days_ahead: number; min_qty_pct: number } }
  | { event: "shopping_list_approved";   props: { list_id: string } }
  | { event: "pantry_report_generated";  props: { items_tracked: number; predictions_count: number } }
  | { event: "alert_triggered";          props: { alert_type: "stockout"; severity: "critical" | "urgent"; item_count: number } };

/** Fire a typed PostHog event (browser-only; no-ops on the server). */
export function track<E extends NeumasEvent["event"]>(
  event: E,
  props: Extract<NeumasEvent, { event: E }>["props"],
): void {
  if (typeof window === "undefined") return;
  posthog.capture(event, props as Record<string, unknown>);
}

// ── Identity ────────────────────────────────────────────────────────────────────

export function identifyUser(params: {
  userId:     string;
  email:      string;
  orgId?:     string | null;
  propertyId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  posthog.identify(params.userId, {
    email:       params.email,
    org_id:      params.orgId    ?? undefined,
    property_id: params.propertyId ?? undefined,
  });
}

export function resetAnalytics(): void {
  if (typeof window === "undefined") return;
  posthog.reset();
}

// ── Error helper ────────────────────────────────────────────────────────────────

/**
 * Show a human-readable sonner toast for an API/UI error and simultaneously
 * capture it to Sentry with the action context.
 *
 * Usage: replace `toast.error(err.message)` in catch blocks with
 *        `captureUIError("load_inventory", err)`
 */
export function captureUIError(action: string, err: unknown): void {
  const message =
    err instanceof Error ? err.message : "Something went wrong. Please try again.";

  toast.error(message);

  Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
    extra: { action },
  });
}
