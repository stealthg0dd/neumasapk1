"use client";

import { useRouter } from "next/navigation";
import { Bell, ChevronDown, Menu, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

import { useAuthStore } from "@/lib/store/auth";
import { useUIStore } from "@/lib/store/ui";
import { logout } from "@/lib/api/endpoints";
import { slideDown } from "@/lib/design-system";

export function Navbar() {
  const router              = useRouter();
  const profile             = useAuthStore((s) => s.profile);
  const clearAuth           = useAuthStore((s) => s.clearAuth);
  const notificationCount   = useUIStore((s) => s.notificationCount);
  const toggleSidebar       = useUIStore((s) => s.toggleSidebar);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  async function handleLogout() {
    try { await logout(); } catch { /* swallow */ }
    clearAuth();
    router.replace("/auth");
  }

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center px-4 gap-4 glass-heavy border-b border-border/50">
      {/* Mobile menu toggle */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
        aria-label="Toggle sidebar"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* ── Org / Property breadcrumb ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-muted-foreground hidden sm:inline truncate max-w-32">
          {profile?.org_name ?? "—"}
        </span>
        {profile?.org_name && (
          <span className="text-border/60 hidden sm:inline">/</span>
        )}
        <span className="font-medium text-foreground/90 truncate max-w-40">
          {profile?.property_name ?? "Loading…"}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Notification bell ─────────────────────────────────────────────── */}
      <button
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
        aria-label={`${notificationCount} notifications`}
      >
        <Bell className="w-5 h-5" />
        {notificationCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-500 ring-2 ring-background" />
        )}
      </button>

      {/* ── User menu ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex items-center gap-2 h-9 pl-2 pr-3 rounded-lg glass-button hover:bg-surface-2 transition-all"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {initials}
          </div>
          <span className="text-sm font-medium text-foreground/80 hidden sm:inline max-w-28 truncate">
            {profile?.full_name || profile?.email?.split("@")[0] || "User"}
          </span>
          <ChevronDown
            className={[
              "w-3.5 h-3.5 text-muted-foreground transition-transform hidden sm:block",
              userMenuOpen ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>

        {/* Dropdown */}
        <AnimatePresence>
          {userMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setUserMenuOpen(false)}
              />
              <motion.div
                variants={slideDown}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute right-0 top-full mt-2 w-52 z-20 glass-heavy rounded-xl border border-border/50 overflow-hidden shadow-xl"
              >
                {/* Profile info */}
                <div className="px-4 py-3 border-b border-border/40">
                  <p className="text-sm font-medium text-foreground truncate">
                    {profile?.full_name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                  <span className="badge-cyan mt-1 inline-block capitalize">
                    {profile?.role ?? "member"}
                  </span>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  {[
                    { label: "Profile",  icon: User,    action: () => {} },
                  ].map(({ label, icon: Icon, action }) => (
                    <button
                      key={label}
                      onClick={() => { action(); setUserMenuOpen(false); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}

                  <div className="my-1 border-t border-border/40" />

                  <button
                    onClick={() => { handleLogout(); setUserMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <span className="w-4 h-4 text-center text-xs">✕</span>
                    Sign out
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
