"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Camera,
  TrendingUp,
  ShoppingCart,
  BarChart3,
  Bell,
  Settings,
  LogOut,
  FileText,
  Store,
  Shield,
} from "lucide-react";

import { useAuthStore } from "@/lib/store/auth";
import { logout } from "@/lib/api/endpoints";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { href: "/dashboard/scans", label: "Scans", icon: Camera },
  { href: "/dashboard/predictions", label: "Predictions", icon: TrendingUp },
  { href: "/dashboard/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/vendors", label: "Vendors", icon: Store },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV_ITEMS = [
  { href: "/dashboard/admin", label: "Admin", icon: Shield },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isAdmin = profile?.role === "admin";

  async function handleLogout() {
    try { await logout(); } catch { /* swallow */ }
    clearAuth();
    router.replace("/login");
  }

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";

  return (
    <aside className="hidden h-full w-[220px] flex-col border-r border-gray-100 bg-white sm:flex">
      <div className="h-16 px-5 flex items-center border-b border-gray-100">
        <span className="text-xl font-semibold text-gray-900">Neumas</span>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 h-10 px-3 rounded-lg text-sm border-l-2 transition-colors",
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-transparent text-gray-600 hover:bg-gray-50"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="mx-3 mt-4 mb-2 border-t border-gray-100" />
            {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 h-10 px-3 rounded-lg text-sm border-l-2 transition-colors",
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-transparent text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-gray-100 p-4">
        <p className="text-sm text-gray-900 font-medium truncate mb-2">{displayName}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
