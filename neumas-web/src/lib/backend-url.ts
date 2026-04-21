const DEFAULT_BACKEND_URL = "https://neumas-production.up.railway.app";

function normalizeAbsoluteUrl(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//.test(trimmed)) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

/** Backend origin for server-side API route proxies. */
export const BACKEND_URL =
  normalizeAbsoluteUrl(process.env.BACKEND_URL) ??
  normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ??
  normalizeAbsoluteUrl(process.env.NEXT_PUBLIC_API_URL) ??
  DEFAULT_BACKEND_URL;
