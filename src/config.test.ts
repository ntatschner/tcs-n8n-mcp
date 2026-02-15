import { describe, it, expect } from "vitest";
import { parseAuthType, buildAuthHeaders, parseTimeoutMs, checkConnection } from "./config.js";
import type { FetchFn } from "./types.js";

// ---------------------------------------------------------------------------
// parseAuthType
// ---------------------------------------------------------------------------
describe("parseAuthType", () => {
  it("defaults to 'apikey' when input is undefined", () => {
    expect(parseAuthType(undefined)).toBe("apikey");
  });

  it("defaults to 'apikey' for empty string", () => {
    expect(parseAuthType("")).toBe("apikey");
  });

  it.each(["apikey", "bearer", "basic"] as const)(
    "accepts '%s'",
    (type) => {
      expect(parseAuthType(type)).toBe(type);
    },
  );

  it.each([
    ["Bearer", "bearer"],
    ["APIKEY", "apikey"],
    ["Basic", "basic"],
  ])("is case-insensitive: '%s' -> '%s'", (input, expected) => {
    expect(parseAuthType(input)).toBe(expected);
  });

  it("throws for invalid value", () => {
    expect(() => parseAuthType("oauth")).toThrow(
      'Invalid N8N_AUTH_TYPE "oauth"',
    );
  });

  it("includes valid options in error message", () => {
    expect(() => parseAuthType("cookie")).toThrow("apikey, bearer, basic");
  });
});

// ---------------------------------------------------------------------------
// buildAuthHeaders
// ---------------------------------------------------------------------------
describe("buildAuthHeaders", () => {
  it("returns X-N8N-API-KEY header for 'apikey'", () => {
    expect(buildAuthHeaders("apikey", "my-key")).toEqual({
      "X-N8N-API-KEY": "my-key",
    });
  });

  it("returns Bearer Authorization header for 'bearer'", () => {
    expect(buildAuthHeaders("bearer", "tok123")).toEqual({
      Authorization: "Bearer tok123",
    });
  });

  it("returns Basic Authorization header for 'basic'", () => {
    const result = buildAuthHeaders("basic", "secret", "admin");
    const expected = Buffer.from("admin:secret").toString("base64");
    expect(result).toEqual({ Authorization: `Basic ${expected}` });
  });

  it("correctly base64-encodes known input", () => {
    const result = buildAuthHeaders("basic", "pass", "user");
    // "user:pass" -> base64 = "dXNlcjpwYXNz"
    expect(result.Authorization).toBe("Basic dXNlcjpwYXNz");
  });

  it("handles special characters in credentials", () => {
    const result = buildAuthHeaders("basic", "p@ss:w0rd!", "us+er");
    const expected = Buffer.from("us+er:p@ss:w0rd!").toString("base64");
    expect(result.Authorization).toBe(`Basic ${expected}`);
  });

  it("throws if apiUser is undefined for 'basic'", () => {
    expect(() => buildAuthHeaders("basic", "key")).toThrow(
      "N8N_API_USER is required",
    );
  });

  it("throws if apiUser is empty string for 'basic'", () => {
    expect(() => buildAuthHeaders("basic", "key", "")).toThrow(
      "N8N_API_USER is required",
    );
  });

  it("rejects credentials with newlines", () => {
    expect(() => buildAuthHeaders("basic", "pass", "user\nadmin")).toThrow(
      "control characters",
    );
    expect(() => buildAuthHeaders("basic", "pass\nword", "user")).toThrow(
      "control characters",
    );
  });

  it("rejects credentials with carriage returns", () => {
    expect(() => buildAuthHeaders("basic", "pass\rword", "user")).toThrow(
      "control characters",
    );
  });

  it("rejects credentials with null bytes", () => {
    expect(() => buildAuthHeaders("basic", "pass", "user\0")).toThrow(
      "control characters",
    );
  });
});

// ---------------------------------------------------------------------------
// parseTimeoutMs
// ---------------------------------------------------------------------------
describe("parseTimeoutMs", () => {
  it("returns 30000 for undefined", () => {
    expect(parseTimeoutMs(undefined)).toBe(30_000);
  });

  it("returns 30000 for empty string", () => {
    expect(parseTimeoutMs("")).toBe(30_000);
  });

  it("parses valid positive integer", () => {
    expect(parseTimeoutMs("5000")).toBe(5000);
  });

  it("returns custom value", () => {
    expect(parseTimeoutMs("60000")).toBe(60_000);
  });

  it("returns 30000 for '0'", () => {
    expect(parseTimeoutMs("0")).toBe(30_000);
  });

  it("returns 30000 for negative value", () => {
    expect(parseTimeoutMs("-5000")).toBe(30_000);
  });

  it("returns 30000 for non-numeric string", () => {
    expect(parseTimeoutMs("abc")).toBe(30_000);
  });

  it("truncates float via parseInt", () => {
    // parseInt("12.5", 10) -> 12, which is > 0
    expect(parseTimeoutMs("12.5")).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// checkConnection
// ---------------------------------------------------------------------------
describe("checkConnection", () => {
  it("returns ok for successful connection", async () => {
    const mockFetch: FetchFn = async () => ({ ok: true }) as Response;
    const result = await checkConnection(mockFetch);
    expect(result).toEqual({ ok: true });
  });

  it("returns error for HTTP failure", async () => {
    const mockFetch: FetchFn = async () =>
      ({ ok: false, status: 401, statusText: "Unauthorized" }) as Response;
    const result = await checkConnection(mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("401");
      expect(result.error).toContain("Unauthorized");
    }
  });

  it("returns error for network failure", async () => {
    const mockFetch: FetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await checkConnection(mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.error).toContain("reachable");
    }
  });

  it("handles non-Error thrown values", async () => {
    const mockFetch: FetchFn = async () => {
      throw "string error";
    };
    const result = await checkConnection(mockFetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("string error");
    }
  });
});
