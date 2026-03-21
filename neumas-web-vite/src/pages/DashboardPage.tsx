import { useCallback, useEffect, useState } from "react";
import { listInventory } from "../api/inventory";
import { listPredictions, triggerForecast } from "../api/predictions";
import { generateShoppingList, listShoppingLists } from "../api/shopping";
import { useAuth } from "../context/AuthContext";
import type { InventoryItem, Prediction, ShoppingList } from "../types";

// ── Urgency badge ─────────────────────────────────────────────────────────────
const URGENCY_CLASS: Record<string, string> = {
  critical: "badge badge-critical",
  urgent: "badge badge-urgent",
  soon: "badge badge-soon",
  later: "badge badge-later",
};

function UrgencyBadge({ level }: { level: string | null }) {
  const label = level ?? "—";
  return <span className={URGENCY_CLASS[label] ?? "badge"}>{label}</span>;
}

// ── Inventory panel ───────────────────────────────────────────────────────────
function InventoryPanel({
  propertyId,
}: {
  propertyId: string;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInventory(propertyId)
      .then(setItems)
      .catch(() => setError("Failed to load inventory"))
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (loading) return <p className="muted">Loading inventory…</p>;
  if (error) return <p className="error-msg">{error}</p>;
  if (items.length === 0) return <p className="muted">No inventory items yet.</p>;

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Category</th>
            <th>Reorder at</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.quantity <= (item.reorder_point ?? 0) ? "row-warn" : ""}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{item.unit ?? "—"}</td>
              <td>{item.category?.name ?? "—"}</td>
              <td>{item.reorder_point ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Predictions panel ─────────────────────────────────────────────────────────
function PredictionsPanel({ propertyId }: { propertyId: string }) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listPredictions(propertyId)
      .then(setPredictions)
      .catch(() => setError("Failed to load predictions"))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    setToast(null);
    try {
      const res = await triggerForecast(propertyId);
      setToast(`Forecast queued (job ${res.job_id.slice(0, 8)}…)`);
      setTimeout(() => { load(); setToast(null); }, 3000);
    } catch {
      setError("Failed to queue forecast");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <div className="panel-actions">
        <button
          className="btn btn-secondary"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Queuing…" : "Refresh predictions"}
        </button>
        {toast && <span className="toast">{toast}</span>}
      </div>

      {loading ? (
        <p className="muted">Loading predictions…</p>
      ) : error ? (
        <p className="error-msg">{error}</p>
      ) : predictions.length === 0 ? (
        <p className="muted">No predictions yet — click "Refresh predictions" to generate.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Predicted date</th>
                <th>Urgency</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p) => (
                <tr key={p.id}>
                  <td>{p.inventory_item?.name ?? p.item_id ?? "—"}</td>
                  <td>{p.prediction_type}</td>
                  <td>{new Date(p.prediction_date).toLocaleDateString()}</td>
                  <td><UrgencyBadge level={p.stockout_risk_level} /></td>
                  <td>{(Number(p.confidence) * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shopping list panel ───────────────────────────────────────────────────────
function ShoppingPanel({ propertyId }: { propertyId: string }) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listShoppingLists(propertyId)
      .then(setLists)
      .catch(() => setError("Failed to load shopping lists"))
      .finally(() => setLoading(false));
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setToast(null);
    try {
      const res = await generateShoppingList(propertyId);
      const id = res.job_id ?? res.id ?? "—";
      setToast(`Generation queued (${String(id).slice(0, 8)}…). Refreshing in 5s…`);
      setTimeout(() => { load(); setToast(null); }, 5000);
    } catch {
      setError("Failed to generate shopping list");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="panel-actions">
        <button
          className="btn btn-secondary"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? "Queuing…" : "Generate shopping list"}
        </button>
        {toast && <span className="toast">{toast}</span>}
      </div>

      {loading ? (
        <p className="muted">Loading shopping lists…</p>
      ) : error ? (
        <p className="error-msg">{error}</p>
      ) : lists.length === 0 ? (
        <p className="muted">No shopping lists yet — click "Generate shopping list".</p>
      ) : (
        lists.map((list) => (
          <div key={list.id} className="shopping-list-card">
            <div className="shopping-list-header">
              <span className="shopping-list-date">
                {new Date(list.created_at).toLocaleString()}
              </span>
              <span className={`badge badge-${list.status}`}>{list.status}</span>
              {list.total_estimated_cost != null && (
                <span className="muted">
                  Est. ${Number(list.total_estimated_cost).toFixed(2)}
                </span>
              )}
            </div>
            {list.items?.length > 0 && (
              <ul className="shopping-items">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.item_name}</strong> — {item.quantity_needed}{" "}
                    {item.unit ?? ""}
                    {item.estimated_cost != null &&
                      ` ($${Number(item.estimated_cost).toFixed(2)})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { propertyId, orgId } = useAuth();

  if (!propertyId) {
    return (
      <div className="page-content">
        <p className="error-msg">No property found. Please log in again.</p>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="muted">
            Property <code>{propertyId.slice(0, 8)}…</code> &nbsp;·&nbsp; Org{" "}
            <code>{orgId?.slice(0, 8)}…</code>
          </p>
        </div>
      </div>

      <section className="panel">
        <h3 className="panel-title">Inventory</h3>
        <InventoryPanel propertyId={propertyId} />
      </section>

      <section className="panel">
        <h3 className="panel-title">Stockout Predictions</h3>
        <PredictionsPanel propertyId={propertyId} />
      </section>

      <section className="panel">
        <h3 className="panel-title">Shopping Lists</h3>
        <ShoppingPanel propertyId={propertyId} />
      </section>
    </div>
  );
}
