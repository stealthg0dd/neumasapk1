/**
 * Offline operation queue — buffers mutations when the device is offline
 * and replays them when connectivity is restored.
 *
 * Each queued operation carries an idempotency key so the backend
 * safely de-duplicates if the same request is submitted more than once.
 *
 * Usage:
 *   import { enqueueOperation, replayQueue } from "@/lib/offline-queue";
 *
 *   // In a component or service:
 *   await enqueueOperation({
 *     method: "POST",
 *     url: "/api/inventory/update",
 *     data: { name: "Chicken", quantity: 5, unit: "kg" },
 *   });
 *
 * The queue is persisted in localStorage under the key "neumas_offline_queue".
 * Stale operations (> MAX_OFFLINE_QUEUE_AGE_DAYS days old) are pruned on load.
 */

import { v4 as uuidv4 } from "uuid";
import apiClient from "@/lib/api/client";

const STORAGE_KEY = "neumas_offline_queue";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface QueuedOperation {
  id: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  createdAt: string;
  attempts: number;
}

function loadQueue(): QueuedOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all: QueuedOperation[] = JSON.parse(raw);
    // Prune stale operations
    const cutoff = Date.now() - MAX_AGE_MS;
    return all.filter((op) => new Date(op.createdAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedOperation[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Add an operation to the offline queue.
 * Returns the idempotency key assigned to the operation.
 */
export function enqueueOperation(
  op: Omit<QueuedOperation, "id" | "createdAt" | "attempts">
): string {
  const id = uuidv4();
  const queue = loadQueue();
  queue.push({ ...op, id, createdAt: new Date().toISOString(), attempts: 0 });
  saveQueue(queue);
  return id;
}

/**
 * Replay all queued operations against the live API.
 * Successful operations are removed from the queue.
 * Failed operations increment their attempt counter (retained for retry).
 *
 * Call this on app foreground / online event:
 *   window.addEventListener("online", replayQueue);
 */
export async function replayQueue(): Promise<{
  replayed: number;
  failed: number;
}> {
  const queue = loadQueue();
  if (queue.length === 0) return { replayed: 0, failed: 0 };

  let replayed = 0;
  let failed = 0;
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      await apiClient.request({
        method: op.method,
        url: op.url,
        data: op.data,
        headers: {
          ...op.headers,
          "Idempotency-Key": op.id,
        },
      });
      replayed++;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 4xx client errors: discard (not retryable)
      if (status && status >= 400 && status < 500) {
        failed++;
      } else {
        // Network error or 5xx: retain for retry
        remaining.push({ ...op, attempts: op.attempts + 1 });
        failed++;
      }
    }
  }

  saveQueue(remaining);
  return { replayed, failed };
}

/** Return the number of operations currently in the queue. */
export function queueLength(): number {
  return loadQueue().length;
}

/** Clear the entire queue (use for testing or forced logout). */
export function clearQueue(): void {
  saveQueue([]);
}
