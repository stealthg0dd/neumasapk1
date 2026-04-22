"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Camera, Home, Menu } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Home",
    icon: Home,
    href: "/dashboard",
    isActive: (pathname: string) => pathname === "/dashboard" || pathname === "/dashboard/",
  },
  {
    label: "Scan",
    icon: Camera,
    href: "/dashboard/scans/new",
    isActive: (pathname: string) => pathname.startsWith("/dashboard/scans"),
  },
  {
    label: "Alerts",
    icon: Bell,
    href: "/dashboard/alerts",
    isActive: (pathname: string) => pathname.startsWith("/dashboard/alerts"),
  },
  {
    label: "More",
    icon: Menu,
    href: "/dashboard/settings",
    isActive: (pathname: string) =>
      pathname.startsWith("/dashboard/settings") ||
      pathname.startsWith("/dashboard/inventory") ||
      pathname.startsWith("/dashboard/shopping") ||
      pathname.startsWith("/dashboard/restock") ||
      pathname.startsWith("/dashboard/predictions") ||
      pathname.startsWith("/dashboard/analytics"),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-4 gap-1 px-2 pt-2">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors",
                active ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
