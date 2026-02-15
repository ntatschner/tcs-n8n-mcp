import type { FetchFn } from "./types.js";

/** Supported authentication types for the n8n API. */
export type AuthType = "apikey" | "bearer" | "basic";

const VALID_AUTH_TYPES: readonly AuthType[] = ["apikey", "bearer", "basic"];

const CONTROL_CHAR_RE = /[\r\n\0]/;

/**
 * Parse and validate N8N_AUTH_TYPE.  Defaults to "apikey" when unset.
 * @throws if the value is not one of the supported types
 */
export function parseAuthType(raw: string | undefined): AuthType {
  const value = (raw || "apikey").toLowerCase();
  if (!VALID_AUTH_TYPES.includes(value as AuthType)) {
    throw new Error(
      `Invalid N8N_AUTH_TYPE "${raw}". Must be one of: ${VALID_AUTH_TYPES.join(", ")}`,
    );
  }
  return value as AuthType;
}

/**
 * Build the authentication headers for n8n API requests.
 * @throws if authType is "basic" and apiUser is missing or contains control characters
 */
export function buildAuthHeaders(
  authType: AuthType,
  apiKey: string,
  apiUser?: string,
): Record<string, string> {
  switch (authType) {
    case "apikey":
      return { "X-N8N-API-KEY": apiKey };
    case "bearer":
      return { Authorization: `Bearer ${apiKey}` };
    case "basic": {
      if (!apiUser) {
        throw new Error(
          "N8N_API_USER is required when N8N_AUTH_TYPE is 'basic'",
        );
      }
      if (CONTROL_CHAR_RE.test(apiUser) || CONTROL_CHAR_RE.test(apiKey)) {
        throw new Error(
          "Invalid credentials: username and password must not contain control characters",
        );
      }
      const encoded = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
  }
}

/**
 * Parse N8N_TIMEOUT_MS env var into a positive integer.
 * Returns 30 000 ms for any invalid / missing value.
 */
export function parseTimeoutMs(raw: string | undefined): number {
  const value = parseInt(raw || "30000", 10);
  if (!Number.isFinite(value) || value <= 0) {
    return 30_000;
  }
  return value;
}

/**
 * Probe the n8n API to verify credentials and connectivity.
 * Returns an object indicating success or failure with an error message.
 */
export async function checkConnection(
  fetchFn: FetchFn,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> {
  try {
    const res = await fetchFn("/workflows?limit=1");
    if (!res.ok) {
      return {
        ok: false,
        error:
          `HTTP ${res.status} ${res.statusText || ""}. ` +
          "Verify N8N_API_URL and credentials are correct.",
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        `${e instanceof Error ? e.message : String(e)}. ` +
        "Verify N8N_API_URL is reachable.",
    };
  }
}
