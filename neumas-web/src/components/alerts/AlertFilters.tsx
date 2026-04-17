/**
 * AlertFilters — state/type/severity filter bar for the alerts page.
 */
"use client";

const ALERT_TYPES = [
  { value: "", label: "All types" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "expiry_risk", label: "Expiry risk" },
  { value: "unusual_price_increase", label: "Price spike" },
  { value: "no_recent_scan", label: "No recent scan" },
];

const SEVERITIES = [
  { value: "", label: "All severity" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

interface AlertFiltersProps {
  stateFilter: string;
  typeFilter: string;
  severityFilter: string;
  onStateChange: (s: string) => void;
  onTypeChange: (s: string) => void;
  onSeverityChange: (s: string) => void;
}

export function AlertFilters({
  stateFilter,
  typeFilter,
  severityFilter,
  onStateChange,
  onTypeChange,
  onSeverityChange,
}: AlertFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* State tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-sm">
        {["open", "snoozed", "resolved", "all"].map((s) => (
          <button
            key={s}
            onClick={() => onStateChange(s)}
            className={`px-3 py-1 rounded-md capitalize transition-colors ${
              stateFilter === s
                ? "bg-white text-gray-900 shadow-sm font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Type select */}
      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {ALERT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Severity select */}
      <select
        value={severityFilter}
        onChange={(e) => onSeverityChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SEVERITIES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {(typeFilter || severityFilter) && (
        <button
          onClick={() => { onTypeChange(""); onSeverityChange(""); }}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
