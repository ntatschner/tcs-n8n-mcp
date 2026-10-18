import type { FetchFn } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface N8nClientOptions {
  readonly baseUrl: string;
  readonly authHeaders: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export function normalizeN8nApiUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("N8N_API_URL must be a valid absolute HTTP or HTTPS URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("N8N_API_URL must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("N8N_API_URL must not contain embedded credentials");
  }
  if (url.search || url.hash) {
    throw new Error("N8N_API_URL must not contain a query string or fragment");
  }

  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/api/v1") ? path : `${path}/api/v1`;
  return url.toString().replace(/\/$/, "");
}

export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export function resourcePath(
  collection: string,
  id: string,
  ...suffix: readonly string[]
): string {
  return `/${[collection, id, ...suffix].map(encodePathSegment).join("/")}`;
}

function assertRelativeApiPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Request path must be a root-relative API path");
  }
  const pathname = path.split(/[?#]/, 1)[0];
  let segments: readonly string[];
  try {
    segments = pathname.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    throw new Error("Request path must be a valid root-relative API path");
  }
  if (segments.some((segment) =>
    segment.includes("\\") || segment.split("/").some((part) => part === "." || part === "..")
  )) {
    throw new Error("Request path must be a root-relative API path without traversal segments");
  }
}

export function createN8nFetch(options: N8nClientOptions): FetchFn {
  const baseUrl = normalizeN8nApiUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new Error("timeoutMs must be an integer between 100 and 120000 milliseconds");
  }

  return async (path, init = {}) => {
    assertRelativeApiPath(path);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    new Headers(options.authHeaders).forEach((value, key) => headers.set(key, value));

    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
      signal,
      // Never forward custom authentication headers to a redirect target.
      redirect: "error",
    });
  };
}
