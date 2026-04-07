"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Bell, Settings, LogOut,
} from "lucide-react";

import { useAuthStore } from "@/lib/store/auth";
import { logout } from "@/lib/api/endpoints";
import { useRouter } from "next/navigation";

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/inventory", label: "Inventory", icon: Package },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  async function handleLogout() {
    try { await logout(); } catch { /* swallow */ }
    clearAuth();
    router.replace("/auth");
  }

  const displayName = profile?.full_name || profile?.email?.split("@")[0] || "User";

  return (
    <aside className="w-[220px] h-full bg-white border-r border-gray-100 flex flex-col">
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
              className={`flex items-center gap-3 h-10 px-3 rounded-lg text-sm border-l-2 transition-colors ${
                active
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-transparent text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
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
