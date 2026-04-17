import React from "react";

export function ExportButton({ url, type = "csv" }: { url: string; type?: "csv" | "pdf" }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-medium transition-colors"
      download
    >
      {type === "pdf" ? (
        <span role="img" aria-label="PDF">📄</span>
      ) : (
        <span role="img" aria-label="CSV">📊</span>
      )}
      Export {type.toUpperCase()}
    </a>
  );
}
