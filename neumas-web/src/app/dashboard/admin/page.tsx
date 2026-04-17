"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Gauge,
  Globe,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import {
  getAdminOrg,
  listAdminUsers,
  listAdminProperties,
  getAdminUsage,
  getSystemHealth,
  listAuditLog,
  listFeatureFlags,
  updateFeatureFlag,
  type AdminOrg,
  type AdminUser,
  type AdminProperty,
  type AdminUsage,
  type SystemHealth,
  type AuditEntry,
} from "@/lib/api/endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "organizations", label: "Organizations", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "properties", label: "Properties", icon: Globe },
  { id: "audit", label: "Audit & Support", icon: Shield },
  { id: "usage", label: "Usage & Metering", icon: BarChart2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-SG", opts ?? { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return "—";
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return fmt(iso);
}

function n(v: number | undefined | null): string {
  if (v == null) return "—";
  return v.toLocaleString();
}

const PLAN_STYLES: Record<string, string> = {
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
  pro: "bg-blue-50 text-blue-700 border border-blue-200",
  pilot: "bg-amber-50 text-amber-700 border border-amber-200",
  free: "bg-gray-100 text-gray-600 border border-gray-200",
};

function PlanBadge({ plan }: { plan: string | null }) {
  const p = (plan ?? "free").toLowerCase();
  const cls = PLAN_STYLES[p] ?? PLAN_STYLES.free;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${cls}`}>
      {p}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const r = role.toLowerCase();
  const cls =
    r === "admin" ? "bg-rose-50 text-rose-700 border border-rose-200" :
    r === "operator" ? "bg-indigo-50 text-indigo-700 border border-indigo-200" :
    "bg-gray-100 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {role}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
      <div className="h-10 bg-gray-50 border-b border-gray-100 animate-pulse" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-gray-50 px-5 py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      ))}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  icon: Icon,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
  highlight?: "green" | "amber" | "red";
}) {
  const tint =
    highlight === "green" ? "bg-emerald-50 text-emerald-600" :
    highlight === "amber" ? "bg-amber-50 text-amber-600" :
    highlight === "red" ? "bg-red-50 text-red-600" :
    "bg-[#f0f7fb] text-[#0071a3]";
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-[24px] font-bold tabular-nums text-gray-900 leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Console header ────────────────────────────────────────────────────────────

function ConsoleHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[18px] font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-gray-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Table wrapper ─────────────────────────────────────────────────────────────

function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">{children}</table>
      </div>
    </div>
  );
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`bg-gray-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function TD({ children, mono, right, muted }: { children: React.ReactNode; mono?: boolean; right?: boolean; muted?: boolean }) {
  return (
    <td className={`border-b border-gray-50 px-5 py-3.5 ${mono ? "font-mono text-[12px]" : ""} ${right ? "text-right" : ""} ${muted ? "text-gray-400" : "text-gray-700"}`}>
      {children}
    </td>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-[180px] max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-3 text-[13px] text-gray-800 outline-none placeholder:text-gray-300 focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/15 transition-colors"
      />
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-[#0071a3] focus:ring-2 focus:ring-[#0071a3]/15 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Pagination({ page, setPage, hasMore }: { page: number; setPage: (p: number) => void; hasMore: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-3">
      <button
        disabled={page === 0}
        onClick={() => setPage(Math.max(0, page - 1))}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </button>
      <span className="font-mono text-[12px] text-gray-400">Page {page + 1}</span>
      <button
        disabled={!hasMore}
        onClick={() => setPage(page + 1)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
      >
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── 1. Overview tab ──────────────────────────────────────────────────────────

function OverviewTab() {
  const [org, setOrg] = useState<AdminOrg | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [props, setProps] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, h, u, us, ps] = await Promise.all([
        getAdminOrg().catch(() => null),
        getSystemHealth().catch(() => null),
        getAdminUsage({ days: 30 }).catch(() => null),
        listAdminUsers().catch(() => []),
        listAdminProperties().catch(() => []),
      ]);
      setOrg(o); setHealth(h); setUsage(u); setUsers(us); setProps(ps);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const healthEntries = useMemo(() => Object.entries(health ?? {}), [health]);
  const healthOk = healthEntries.every(([, v]) => v === "ok" || v === true || v === "healthy");

  if (loading) return (
    <div className="space-y-6">
      <StatSkeleton />
      <Skeleton rows={3} cols={3} />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KPI label="Active users" value={n(usage?.active_users ?? users.length)} icon={Users} />
        <KPI label="Outlets" value={n(usage?.active_properties ?? props.length)} icon={Globe} />
        <KPI label="Docs processed" value={n(usage?.documents_scanned)} icon={FileText} sub={`last ${usage?.period_days ?? 30}d`} />
        <KPI label="Line items" value={n(usage?.line_items_processed)} icon={Activity} />
        <KPI label="Exports" value={n(usage?.exports_generated)} icon={BarChart2} />
        <KPI
          label="System"
          value={healthOk ? "Healthy" : "Degraded"}
          icon={healthOk ? CheckCircle2 : AlertTriangle}
          highlight={healthOk ? "green" : "red"}
        />
      </div>

      {/* Org card */}
      {org && (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Active organization</p>
              <h3 className="mt-1 text-[20px] font-bold text-gray-900">{org.name}</h3>
            </div>
            <PlanBadge plan={org.plan} />
          </div>
          <div className="grid grid-cols-2 gap-5 border-t border-gray-100 pt-5 sm:grid-cols-4">
            {[
              { label: "Org ID", value: org.id, mono: true },
              { label: "Plan tier", value: org.plan ?? "Free" },
              { label: "Created", value: fmt(org.created_at) },
              { label: "Outlets", value: n(props.length) },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-[11px] text-gray-400">{f.label}</p>
                <p className={`mt-0.5 text-[13px] font-medium text-gray-800 ${f.mono ? "font-mono text-[12px]" : ""}`}>
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* System health */}
      {healthEntries.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-gray-700">System health</p>
            {lastRefresh && (
              <span className="font-mono text-[11px] text-gray-400">
                · refreshed {fmtRelative(lastRefresh.toISOString())}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {healthEntries.map(([key, val]) => {
              const ok = val === "ok" || val === true || val === "healthy" || val === "connected";
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 rounded-xl border p-4 ${
                    ok ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
                  }`}
                >
                  <StatusDot ok={ok} />
                  <div>
                    <p className={`text-[12px] font-semibold capitalize ${ok ? "text-emerald-800" : "text-red-800"}`}>
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className={`text-[11px] font-mono ${ok ? "text-emerald-600" : "text-red-600"}`}>
                      {String(val)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick metrics */}
      {usage && (
        <section className="space-y-3">
          <p className="text-[13px] font-semibold text-gray-700">Metering summary — last {usage.period_days} days</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "LLM calls", value: n(usage.llm_calls) },
              { label: "LLM cost (USD)", value: `$${(usage.llm_cost_usd ?? 0).toFixed(4)}` },
              { label: "Period", value: `${fmt(usage.period_start)} – ${fmt(usage.period_end)}` },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-white px-5 py-4">
                <span className="text-[13px] text-gray-500">{m.label}</span>
                <span className="font-mono text-[13px] font-semibold text-gray-800">{m.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── 2. Organizations tab ─────────────────────────────────────────────────────

function OrganizationsTab() {
  const [org, setOrg] = useState<AdminOrg | null>(null);
  const [props, setProps] = useState<AdminProperty[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAdminOrg().catch(() => null),
      listAdminProperties().catch(() => []),
      listAdminUsers().catch(() => []),
      getAdminUsage({ days: 30 }).catch(() => null),
    ]).then(([o, ps, us, u]) => {
      setOrg(o); setProps(ps); setUsers(us); setUsage(u);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton rows={1} cols={6} />;

  return (
    <div className="space-y-6">
      <ConsoleHeader
        title="Organizations"
        subtitle="All registered organizations, plan status, and usage summary"
      />

      {/* Single org card (real data) */}
      {org && (
        <div className="rounded-2xl border border-black/[0.06] bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f7fb]">
                <Building2 className="h-5 w-5 text-[#0071a3]" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-gray-900">{org.name}</p>
                <p className="font-mono text-[11px] text-gray-400">{org.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <PlanBadge plan={org.plan} />
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                <StatusDot ok /> Active
              </span>
            </div>
          </div>

          <div className="grid divide-y divide-gray-50 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {[
              { label: "Users", value: n(users.length), icon: Users },
              { label: "Outlets", value: n(props.length), icon: Globe },
              { label: "Docs (30d)", value: n(usage?.documents_scanned), icon: FileText },
              { label: "Created", value: fmt(org.created_at), icon: Clock },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="flex items-center gap-3 px-6 py-4">
                  <Icon className="h-4 w-4 shrink-0 text-gray-300" />
                  <div>
                    <p className="text-[11px] text-gray-400">{m.label}</p>
                    <p className="text-[15px] font-bold text-gray-900">{m.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Users roster for this org */}
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-gray-700">Users in organization</p>
        <DataTable>
          <thead>
            <tr>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Member since</TH>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="group hover:bg-gray-50/80 transition-colors">
                <TD><span className="font-medium text-gray-900">{u.email}</span></TD>
                <TD><RoleBadge role={u.role} /></TD>
                <TD muted>{fmt(u.created_at)}</TD>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-[13px] text-gray-400">No users found</td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </section>

      {/* Outlets for this org */}
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-gray-700">Registered outlets</p>
        <DataTable>
          <thead>
            <tr>
              <TH>Outlet name</TH>
              <TH>Type</TH>
              <TH>Created</TH>
            </tr>
          </thead>
          <tbody>
            {props.map((p) => (
              <tr key={p.id} className="group hover:bg-gray-50/80 transition-colors">
                <TD><span className="font-medium text-gray-900">{p.name}</span></TD>
                <TD muted>{p.type ? <span className="capitalize">{p.type}</span> : "—"}</TD>
                <TD muted>{fmt(p.created_at)}</TD>
              </tr>
            ))}
            {!props.length && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-[13px] text-gray-400">No outlets registered</td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </section>
    </div>
  );
}

// ─── 3. Users tab ─────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  useEffect(() => {
    listAdminUsers().then((u) => { setUsers(u); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const matchQ = !q || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
      const matchRole = !roleFilter || u.role.toLowerCase() === roleFilter.toLowerCase();
      return matchQ && matchRole;
    });
  }, [users, search, roleFilter]);

  const roles = useMemo(() => {
    const r = [...new Set(users.map((u) => u.role))];
    return [{ value: "", label: "All roles" }, ...r.map((v) => ({ value: v, label: v }))];
  }, [users]);

  if (loading) return <Skeleton rows={5} cols={4} />;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="User management"
        subtitle={`${users.length} total accounts`}
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by email or role…" />
        <Select value={roleFilter} onChange={setRoleFilter} options={roles} />
        {(search || roleFilter) && (
          <button
            onClick={() => { setSearch(""); setRoleFilter(""); }}
            className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-[12px] text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Filter className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </FilterBar>

      <DataTable>
        <thead>
          <tr>
            <TH>Email</TH>
            <TH>User ID</TH>
            <TH>Role</TH>
            <TH>Account created</TH>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} className="group hover:bg-gray-50/80 transition-colors">
              <TD>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 font-semibold text-[11px] uppercase text-gray-500">
                    {u.email[0]}
                  </div>
                  <span className="font-medium text-gray-900">{u.email}</span>
                </div>
              </TD>
              <TD mono muted>{u.id.slice(0, 12)}…</TD>
              <TD><RoleBadge role={u.role} /></TD>
              <TD muted>{fmt(u.created_at)}</TD>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-gray-400">
                {search || roleFilter ? "No users match current filters" : "No users found"}
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>

      <p className="text-[11px] text-gray-400">
        Showing {filtered.length} of {users.length} users
      </p>
    </div>
  );
}

// ─── 4. Properties tab ────────────────────────────────────────────────────────

function PropertiesTab() {
  const [props, setProps] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    listAdminProperties().then((p) => { setProps(p); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    return props.filter((p) => {
      const q = search.toLowerCase();
      const matchQ = !q || p.name.toLowerCase().includes(q);
      const matchType = !typeFilter || (p.type ?? "").toLowerCase() === typeFilter.toLowerCase();
      return matchQ && matchType;
    });
  }, [props, search, typeFilter]);

  const types = useMemo(() => {
    const t = [...new Set(props.map((p) => p.type ?? "").filter(Boolean))];
    return [{ value: "", label: "All types" }, ...t.map((v) => ({ value: v, label: v }))];
  }, [props]);

  if (loading) return <Skeleton rows={5} cols={4} />;

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Property & outlet management"
        subtitle={`${props.length} registered outlets`}
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by outlet name…" />
        {types.length > 1 && (
          <Select value={typeFilter} onChange={setTypeFilter} options={types} />
        )}
        {(search || typeFilter) && (
          <button
            onClick={() => { setSearch(""); setTypeFilter(""); }}
            className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-[12px] text-gray-500 hover:bg-gray-50"
          >
            <Filter className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </FilterBar>

      <DataTable>
        <thead>
          <tr>
            <TH>Outlet name</TH>
            <TH>Property ID</TH>
            <TH>Type</TH>
            <TH>Created</TH>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id} className="group hover:bg-gray-50/80 transition-colors">
              <TD>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#f0f7fb]">
                    <Globe className="h-3.5 w-3.5 text-[#0071a3]" />
                  </div>
                  <span className="font-medium text-gray-900">{p.name}</span>
                </div>
              </TD>
              <TD mono muted>{p.id.slice(0, 12)}…</TD>
              <TD muted>{p.type ? <span className="capitalize">{p.type}</span> : "—"}</TD>
              <TD muted>{fmt(p.created_at)}</TD>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-gray-400">
                {search || typeFilter ? "No outlets match current filters" : "No outlets registered"}
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}

// ─── 5. Audit & Support tab ───────────────────────────────────────────────────

const AUDIT_EVENT_TYPES = [
  { value: "", label: "All events" },
  { value: "scan", label: "Scan" },
  { value: "document", label: "Document" },
  { value: "inventory", label: "Inventory" },
  { value: "alert", label: "Alert" },
  { value: "report", label: "Report" },
  { value: "user", label: "User" },
  { value: "auth", label: "Auth" },
];

const PAGE_SIZE = 25;

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [resourceFilter, setResourceFilter] = useState("");
  const [actorSearch, setActorSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (p: number, rf: string) => {
    setLoading(true);
    try {
      const r = await listAuditLog({
        resource_type: rf || undefined,
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      });
      setEntries(r.entries ?? []);
      setTotal(r.total ?? 0);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page, resourceFilter); }, [load, page, resourceFilter]);

  const filtered = useMemo(() => {
    if (!actorSearch) return entries;
    const q = actorSearch.toLowerCase();
    return entries.filter((e) =>
      (e.actor_id ?? "").toLowerCase().includes(q) ||
      (e.action ?? "").toLowerCase().includes(q)
    );
  }, [entries, actorSearch]);

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Audit log"
        subtitle={`${n(total)} total events — live visibility into all system actions`}
        action={
          <button
            onClick={() => load(page, resourceFilter)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />

      <FilterBar>
        <SearchInput value={actorSearch} onChange={setActorSearch} placeholder="Filter by actor or action…" />
        <Select
          value={resourceFilter}
          onChange={(v) => { setResourceFilter(v); setPage(0); }}
          options={AUDIT_EVENT_TYPES}
        />
      </FilterBar>

      {loading ? (
        <Skeleton rows={8} cols={4} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <TH>Action</TH>
                  <TH>Resource</TH>
                  <TH>Actor</TH>
                  <TH>Role</TH>
                  <TH>When</TH>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <>
                    <tr
                      key={e.id}
                      className="group cursor-pointer hover:bg-gray-50/80 transition-colors"
                      onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                    >
                      <TD>
                        <span className="font-mono text-[12px] font-semibold text-gray-700">{e.action}</span>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                            {e.resource_type}
                          </span>
                          {e.resource_id && (
                            <span className="font-mono text-[11px] text-gray-400">
                              {e.resource_id.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD mono muted>{e.actor_id ? e.actor_id.slice(0, 10) + "…" : "system"}</TD>
                      <TD>
                        {e.actor_role ? <RoleBadge role={e.actor_role} /> : <span className="text-gray-300">—</span>}
                      </TD>
                      <TD muted>{fmtRelative(e.created_at)}</TD>
                    </tr>
                    {expanded === e.id && e.metadata && (
                      <tr key={`${e.id}-meta`}>
                        <td colSpan={5} className="border-b border-gray-50 bg-gray-50 px-5 pb-3 pt-0">
                          <pre className="overflow-x-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-relaxed text-gray-200">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-gray-400">
                      No audit entries match current filters
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} setPage={setPage} hasMore={entries.length === PAGE_SIZE} />
        </div>
      )}

      {/* Support-oriented context */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-[13px] font-semibold text-amber-800">Support visibility</p>
            <p className="mt-1 text-[12px] text-amber-700">
              Click any row to expand its metadata payload. Filter by resource_type to isolate specific workflows.
              Actor ID &quot;system&quot; denotes background job actions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 6. Usage & Metering tab ──────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, { docs: number; users: number; properties: number }> = {
  free: { docs: 50, users: 2, properties: 1 },
  pilot: { docs: 500, users: 10, properties: 5 },
  pro: { docs: 5000, users: 25, properties: 20 },
  enterprise: { docs: 99999, users: 99999, properties: 99999 },
};

function UsageMeter({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = limit >= 99999 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color =
    pct >= 90 ? "bg-red-500" :
    pct >= 70 ? "bg-amber-500" :
    "bg-[#0071a3]";
  const textColor =
    pct >= 90 ? "text-red-600" :
    pct >= 70 ? "text-amber-600" :
    "text-[#0071a3]";

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-gray-700">{label}</p>
        {limit >= 99999 ? (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600">Unlimited</span>
        ) : (
          <span className={`text-[12px] font-semibold tabular-nums ${textColor}`}>{pct}%</span>
        )}
      </div>
      <p className="mb-2 text-[22px] font-bold tabular-nums text-gray-900">
        {n(used)}
        {limit < 99999 && <span className="ml-1 text-[14px] font-normal text-gray-400">/ {n(limit)}{unit ? ` ${unit}` : ""}</span>}
      </p>
      {limit < 99999 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function UsageTab() {
  const [org, setOrg] = useState<AdminOrg | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [props, setProps] = useState<AdminProperty[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, u, us, ps, fl] = await Promise.all([
        getAdminOrg().catch(() => null),
        getAdminUsage({ days }).catch(() => null),
        listAdminUsers().catch(() => []),
        listAdminProperties().catch(() => []),
        listFeatureFlags().catch(() => ({})),
      ]);
      setOrg(o); setUsage(u); setUsers(us); setProps(ps); setFlags(fl);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  async function toggleFlag(name: string, current: boolean) {
    setTogglingFlag(name);
    try {
      await updateFeatureFlag(name, !current);
      setFlags((prev) => ({ ...prev, [name]: !current }));
    } finally {
      setTogglingFlag(null);
    }
  }

  const plan = (org?.plan ?? "pilot").toLowerCase();
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.pilot;

  if (loading) return (
    <div className="space-y-6">
      <StatSkeleton />
      <Skeleton rows={3} cols={2} />
    </div>
  );

  return (
    <div className="space-y-8">
      <ConsoleHeader
        title="Usage & metering"
        subtitle={`Billable metrics and plan enforcement for ${org?.name ?? "this organization"}`}
        action={
          <div className="flex items-center gap-2">
            <Select
              value={String(days)}
              onChange={(v) => setDays(Number(v))}
              options={[
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
                { value: "90", label: "Last 90 days" },
              ]}
            />
          </div>
        }
      />

      {/* Plan context */}
      <div className="flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f7fb]">
          <Zap className="h-5 w-5 text-[#0071a3]" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-gray-900">
            {org?.name ?? "Organization"} · <PlanBadge plan={org?.plan ?? null} />
          </p>
          <p className="mt-0.5 text-[12px] text-gray-400">
            {plan === "enterprise" ? "Unlimited usage — no enforcement thresholds" : `Plan limits enforced: ${n(limits.docs)} docs · ${n(limits.users)} users · ${n(limits.properties)} outlets`}
          </p>
        </div>
      </div>

      {/* Usage meters */}
      <section className="space-y-3">
        <p className="text-[13px] font-semibold text-gray-700">Billable consumption — last {days} days</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <UsageMeter
            label="Documents processed"
            used={usage?.documents_scanned ?? 0}
            limit={limits.docs}
          />
          <UsageMeter
            label="Active users"
            used={usage?.active_users ?? users.length}
            limit={limits.users}
          />
          <UsageMeter
            label="Active outlets"
            used={usage?.active_properties ?? props.length}
            limit={limits.properties}
          />
          <UsageMeter
            label="Line items extracted"
            used={usage?.line_items_processed ?? 0}
            limit={99999}
          />
          <UsageMeter
            label="Exports generated"
            used={usage?.exports_generated ?? 0}
            limit={99999}
          />
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-sm">
            <p className="mb-3 text-[13px] font-medium text-gray-700">LLM cost (USD)</p>
            <p className="text-[22px] font-bold tabular-nums text-gray-900">
              ${(usage?.llm_cost_usd ?? 0).toFixed(4)}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {n(usage?.llm_calls ?? 0)} API calls · last {days}d
            </p>
          </div>
        </div>
      </section>

      {/* Feature flags */}
      {Object.keys(flags).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-gray-400" />
            <p className="text-[13px] font-semibold text-gray-700">Feature flags</p>
          </div>
          <div className="rounded-2xl border border-black/[0.06] bg-white shadow-sm overflow-hidden">
            {Object.entries(flags).map(([name, enabled], idx) => (
              <div
                key={name}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${idx > 0 ? "border-t border-gray-50" : ""}`}
              >
                <div>
                  <p className="font-mono text-[13px] font-semibold text-gray-800">{name}</p>
                  <p className="text-[11px] text-gray-400">
                    {enabled ? "Enabled — feature is active for this org" : "Disabled — feature is suppressed"}
                  </p>
                </div>
                <button
                  onClick={() => toggleFlag(name, enabled)}
                  disabled={togglingFlag === name}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                    enabled ? "bg-[#0071a3]" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Console header bar */}
      <div className="border-b border-black/[0.06] bg-white px-6 pb-0 pt-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0071a3]">
              <Shield className="h-4.5 w-4.5 h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <h1 className="text-[18px] font-bold text-gray-900">Admin control plane</h1>
              <p className="text-[12px] text-gray-400">Internal ops · Support · Governance</p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                  tab === id
                    ? "border-[#0071a3] text-[#0071a3]"
                    : "border-transparent text-gray-400 hover:text-gray-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {tab === "overview" && <OverviewTab />}
        {tab === "organizations" && <OrganizationsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "properties" && <PropertiesTab />}
        {tab === "audit" && <AuditTab />}
        {tab === "usage" && <UsageTab />}
      </div>
    </div>
  );
}
