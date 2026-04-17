"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  getAdminOrg,
  listAdminUsers,
  listAdminProperties,
  getAdminUsage,
  getSystemHealth,
  listAuditLog,
  type AdminOrg,
  type AdminUser,
  type AdminProperty,
  type AdminUsage,
  type SystemHealth,
  type AuditEntry,
} from "@/lib/api/endpoints";

const TAB_LABELS = ["Overview", "Users", "Properties", "Audit Log"] as const;
type Tab = (typeof TAB_LABELS)[number];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div>
        <h1 className="text-gray-900 font-semibold text-lg">Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Organisation settings, users, and audit history</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TAB_LABELS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewPanel />}
      {tab === "Users" && <UsersPanel />}
      {tab === "Properties" && <PropertiesPanel />}
      {tab === "Audit Log" && <AuditLogPanel />}
    </motion.div>
  );
}

// ─── Overview Panel ─────────────────────────────────────────────────────────

function OverviewPanel() {
  const [org, setOrg] = useState<AdminOrg | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminOrg(), getSystemHealth(), getAdminUsage()]).then(
      ([o, h, u]) => {
        setOrg(o);
        setHealth(h);
        setUsage(u);
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Org Info */}
      {org && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Organisation</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4 grid grid-cols-2 gap-4 text-sm">
            <Field label="Name" value={org.name} />
            <Field label="Plan" value={org.plan ?? "—"} />
            <Field label="ID" value={org.id} mono />
          </div>
        </section>
      )}

      {/* System Health */}
      {health && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">System Health</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(health).map(([k, v]) => (
              <div
                key={k}
                className={`rounded-lg border p-3 text-sm ${
                  v === "ok" || v === true
                    ? "border-green-200 bg-green-50 text-green-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                <div className="font-medium capitalize">{k.replace(/_/g, " ")}</div>
                <div className="mt-0.5 text-xs">{String(v)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Usage Metrics */}
      {usage && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Usage (last 30 days)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <UsageStat label="Documents scanned" value={usage.documents_scanned} />
            <UsageStat label="Line items processed" value={usage.line_items_processed} />
            <UsageStat label="Exports generated" value={usage.exports_generated} />
            <UsageStat label="Active users" value={usage.active_users} />
            <UsageStat label="Active properties" value={usage.active_properties} />
            <UsageStat
              label="LLM cost (USD)"
              value={`$${(usage.llm_cost_usd ?? 0).toFixed(4)}`}
            />
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Users Panel ─────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAdminUsers().then((u) => {
      setUsers(u);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            {["Email", "Role", "Created"].map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium text-gray-600 text-xs">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{u.email}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {u.role}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
            </tr>
          ))}
          {!users.length && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">
                No users found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Properties Panel ────────────────────────────────────────────────────────

function PropertiesPanel() {
  const [props, setProps] = useState<AdminProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAdminProperties().then((p) => {
      setProps(p);
      setLoading(false);
    });
  }, []);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            {["Name", "Type", "Created"].map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium text-gray-600 text-xs">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {props.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
              <td className="px-4 py-3 text-gray-500 capitalize">{p.type ?? "—"}</td>
              <td className="px-4 py-3 text-gray-500">{formatDate(p.created_at)}</td>
            </tr>
          ))}
          {!props.length && (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">
                No properties found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Audit Log Panel ─────────────────────────────────────────────────────────

function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  async function load(p: number) {
    setLoading(true);
    try {
      const resp = await listAuditLog({ limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setEntries(resp.entries ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page); }, [page]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              {["Action", "Resource", "Actor", "When"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium text-gray-600 text-xs">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{e.action}</td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                    {e.resource_type}
                  </span>
                  {e.resource_id && (
                    <span className="ml-1 text-gray-400 font-mono text-xs">
                      {e.resource_id.slice(0, 8)}…
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {e.actor_id ? e.actor_id.slice(0, 8) + "…" : "—"}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.created_at)}</td>
              </tr>
            ))}
            {!entries.length && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">
                  No audit entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          disabled={entries.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-gray-800 mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function UsageStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-SG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
