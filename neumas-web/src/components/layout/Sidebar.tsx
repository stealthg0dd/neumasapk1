"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Forklift,
  Store,
  Shield,
} from "lucide-react";

import { useAuthStore } from "@/lib/store/auth";
import { logout } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { href: "/dashboard/scans", label: "Scans", icon: Camera },
  { href: "/dashboard/predictions", label: "Predictions", icon: TrendingUp },
  { href: "/dashboard/restock", label: "Restock", icon: Forklift },
  { href: "/dashboard/shopping", label: "Shopping", icon: ShoppingCart },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/vendors", label: "Vendors", icon: Store },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV_ITEMS = [{ href: "/dashboard/admin", label: "Admin", icon: Shield }];

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isAdmin = profile?.role === "admin";
  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* clear client state even if API logout fails */
    }
    clearAuth();
    onNavigate?.();
    router.replace("/auth");
  }

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col bg-white",
        className
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-gray-100 px-5">
        <div>
          <span className="block text-lg font-semibold text-gray-900">Neumas</span>
          <span className="block text-xs text-gray-400">Shift-ready control center</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-blue-100 bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Admin
            </p>
            <div className="space-y-1">
              {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "border-blue-100 bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-100 p-4">
        <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
        <p className="truncate text-xs text-gray-400">{profile?.email ?? "Signed in"}</p>
        <button
          onClick={handleLogout}
          className="mt-3 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
