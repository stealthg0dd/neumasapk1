import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { getScanStatus, uploadScan } from "../api/scans";
import { useAuth } from "../context/AuthContext";
import type { ScanStatus } from "../types";

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 12;

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "polling"; scanId: string; attempt: number }
  | { phase: "done"; scanId: string; result: ScanStatus }
  | { phase: "error"; message: string };

export default function ScanUploadPage() {
  const { propertyId } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [scanType, setScanType] = useState("receipt");
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setState({ phase: "idle" });
  }

  function stopPolling() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function schedulePoll(scanId: string, attempt: number) {
    if (attempt > MAX_POLLS) {
      setState({ phase: "done", scanId, result: { scan_id: scanId, status: "timeout", processed: false, error_message: "Timed out waiting for processing", created_at: null } });
      return;
    }
    setState({ phase: "polling", scanId, attempt });
    timerRef.current = setTimeout(async () => {
      try {
        const status = await getScanStatus(scanId);
        if (status.status === "completed" || status.status === "failed") {
          setState({ phase: "done", scanId, result: status });
        } else {
          schedulePoll(scanId, attempt + 1);
        }
      } catch {
        setState({ phase: "error", message: "Failed to fetch scan status." });
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !propertyId) return;
    stopPolling();
    setState({ phase: "uploading" });
    try {
      const res = await uploadScan(file, scanType, propertyId);
      schedulePoll(res.scan_id, 1);
    } catch {
      setState({ phase: "error", message: "Upload failed. Check that the file is a valid image." });
    }
  }

  function handleReset() {
    stopPolling();
    setFile(null);
    setState({ phase: "idle" });
  }

  const busy = state.phase === "uploading" || state.phase === "polling";

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>Scan Upload</h2>
      </div>

      <section className="panel">
        <h3 className="panel-title">Upload receipt or barcode image</h3>
        <form onSubmit={handleSubmit} className="scan-form">
          <div className="field-row">
            <label className="field-label" htmlFor="scan-type">
              Scan type
            </label>
            <select
              id="scan-type"
              className="field-input field-select"
              value={scanType}
              onChange={(e) => setScanType(e.target.value)}
              disabled={busy}
            >
              <option value="receipt">Receipt</option>
              <option value="barcode">Barcode</option>
              <option value="full">Full shelf</option>
            </select>
          </div>

          <div className="field-row">
            <label className="field-label" htmlFor="scan-file">
              Image file
            </label>
            <input
              id="scan-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              onChange={handleFileChange}
              disabled={busy}
              className="field-input"
            />
          </div>

          <div className="scan-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!file || busy}
            >
              {state.phase === "uploading" ? "Uploading…" : "Upload & process"}
            </button>
            {state.phase !== "idle" && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleReset}
              >
                Reset
              </button>
            )}
          </div>
        </form>

        {/* Status display */}
        {state.phase === "polling" && (
          <div className="scan-status scan-status-polling">
            <span className="spinner" />
            Scan queued — polling for completion ({state.attempt}/{MAX_POLLS})…
            <br />
            <code className="muted">{state.scanId}</code>
          </div>
        )}

        {state.phase === "done" && (
          <div
            className={`scan-status ${state.result.status === "completed" ? "scan-status-ok" : "scan-status-fail"}`}
          >
            <strong>
              {state.result.status === "completed" ? "Processing complete" : `Status: ${state.result.status}`}
            </strong>
            <br />
            <code>{state.result.scan_id}</code>
            {state.result.error_message && (
              <p className="error-msg">{state.result.error_message}</p>
            )}
          </div>
        )}

        {state.phase === "error" && (
          <p className="error-msg scan-status">{state.message}</p>
        )}
      </section>
    </div>
  );
}
