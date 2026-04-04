"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

/** Maps URL pathnames to human-readable page names for analytics. */
function getPageName(path: string): string {
  if (path === "/" || path === "/dashboard") return "Dashboard Home";
  if (path === "/dashboard/inventory")       return "Inventory";
  if (path === "/dashboard/scans")           return "Receipt Scans";
  if (path === "/dashboard/scans/history")   return "Scan History";
  if (path === "/dashboard/predictions")     return "Predictions";
  if (path === "/dashboard/shopping")        return "Shopping Lists";
  if (path.startsWith("/dashboard/shopping/")) return "Shopping List Detail";
  if (path === "/dashboard/analytics")       return "Analytics";
  if (path === "/dashboard/settings")        return "Settings";
  if (path === "/login")                     return "Login";
  if (path === "/signup")                    return "Signup";
  return path;
}

/**
 * Fires a `page_viewed` PostHog event whenever the App Router pathname
 * changes (covers both hard navigations and client-side route transitions).
 * Must be rendered inside the PostHogProvider.
 */
export function PageTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    track("page_viewed", { page_name: getPageName(pathname), path: pathname });
  }, [pathname]);

  return null;
}
