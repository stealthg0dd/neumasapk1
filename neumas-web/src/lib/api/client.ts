/**
 * Neumas Axios API client
 *
 * Features:
 * - Base URL from NEXT_PUBLIC_API_URL (direct to Railway) or falls back to /api (Next.js proxy)
 * - Bearer token injection from localStorage
 * - Request/response logging in development
 * - Automatic retry with exponential backoff (3 attempts) on 5xx / network errors
 * - Normalised error messages surfaced as readable strings
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
} from "axios";

// ── Config ────────────────────────────────────────────────────────────────────

// Prevents multiple 401 responses from triggering parallel redirect+clear cycles.
// Once the first 401 fires the redirect, all subsequent 401s are no-ops.
let _redirectingToLogin = false;

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL ?? "") // use env var; empty = same origin (proxy)
    : process.env.NEXT_PUBLIC_API_URL ?? "";

const IS_DEV = process.env.NODE_ENV === "development";

// Max attempts (original + 2 retries)
const MAX_RETRIES = 3;
// Base delay for exponential backoff (ms)
const RETRY_BASE_DELAY = 400;

// ── Token helpers ─────────────────────────────────────────────────────────────

/** Read token from localStorage. Safe to call during SSR (returns null). */
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("neumas_access_token");
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ── Request interceptor ───────────────────────────────────────────────────────

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Inject Bearer token
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Development logging
    if (IS_DEV) {
      console.debug(
        `[API] ▶ ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`,
        config.params ?? ""
      );
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// ── Response interceptor ──────────────────────────────────────────────────────

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (IS_DEV) {
      console.debug(
        `[API] ✓ ${response.status} ${response.config.url}`,
        response.data
      );
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & {
      _retryCount?: number;
    };

    // Retry counter (attach to config so it survives re-attempts)
    config._retryCount = config._retryCount ?? 0;

    const shouldRetry =
      !_redirectingToLogin &&
      config._retryCount < MAX_RETRIES - 1 &&
      (error.response == null || // network error
        // Retry 5xx but NOT 503 — "service unavailable" from the backend
        // (Redis/worker down) is not transient; retrying just adds delay.
        (error.response.status >= 500 &&
          error.response.status < 600 &&
          error.response.status !== 503));

    if (shouldRetry) {
      config._retryCount += 1;
      const delay = RETRY_BASE_DELAY * 2 ** (config._retryCount - 1); // 400 → 800 → 1600 ms
      if (IS_DEV) {
        console.warn(
          `[API] ↻ Retry ${config._retryCount}/${MAX_RETRIES - 1} for ${config.url} in ${delay}ms`
        );
      }
      await new Promise((r) => setTimeout(r, delay));
      return apiClient(config);
    }

    // Normalise error message
    const detail = (error.response?.data as { detail?: unknown })?.detail;
    let message: string;

    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((d) =>
          typeof d === "object" && d !== null && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : String(d)
        )
        .join("; ");
    } else if (error.response?.status === 401) {
      message = "Session expired. Please log in again.";
      // Only the first 401 should clear state and redirect — subsequent ones
      // (from requests that fired before the redirect completes) are no-ops.
      if (typeof window !== "undefined" && !_redirectingToLogin) {
        _redirectingToLogin = true;
        localStorage.removeItem("neumas_access_token");
        localStorage.removeItem("neumas-auth"); // Zustand persist key
        window.location.href = "/auth";
      }
    } else if (error.response?.status === 403) {
      message = "You do not have permission to perform this action.";
    } else if (error.response?.status === 404) {
      message = "Resource not found.";
    } else if (!error.response) {
      message = "Network error — check your connection.";
    } else {
      message = `Server error (${error.response.status})`;
    }

    if (IS_DEV) {
      console.error(
        `[API] ✗ ${error.response?.status ?? "NETWORK"} ${config.url}:`,
        message
      );
    }

    // Attach normalised message so callers can use error.message
    error.message = message;
    return Promise.reject(error);
  }
);

// ── Typed convenience wrappers ────────────────────────────────────────────────

export async function get<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await apiClient.get<T>(url, { params, ...config });
  return res.data;
}

export async function post<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await apiClient.post<T>(url, data, config);
  return res.data;
}

export async function patch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await apiClient.patch<T>(url, data, config);
  return res.data;
}

export async function del<T = void>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await apiClient.delete<T>(url, config);
  return res.data;
}

export default apiClient;
