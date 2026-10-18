import { describe, expect, it, vi } from "vitest";
import {
  createN8nFetch,
  encodePathSegment,
  normalizeN8nApiUrl,
  resourcePath,
} from "./client.js";

describe("normalizeN8nApiUrl", () => {
  it.each([
    ["https://n8n.example.com", "https://n8n.example.com/api/v1"],
    ["https://n8n.example.com/", "https://n8n.example.com/api/v1"],
    ["https://n8n.example.com/api/v1", "https://n8n.example.com/api/v1"],
    ["https://n8n.example.com/api/v1/", "https://n8n.example.com/api/v1"],
    ["https://n8n.example.com/n8n", "https://n8n.example.com/n8n/api/v1"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeN8nApiUrl(input)).toBe(expected);
  });

  it.each(["ftp://n8n.example.com", "not a URL", "https://user:pass@n8n.example.com"])(
    "rejects unsafe URL %s",
    (input) => expect(() => normalizeN8nApiUrl(input)).toThrow(),
  );

  it.each([
    "https://n8n.example.com?token=secret",
    "https://n8n.example.com/#fragment",
  ])("rejects URL metadata %s", (input) => {
    expect(() => normalizeN8nApiUrl(input)).toThrow("query string or fragment");
  });
});

describe("path helpers", () => {
  it("encodes every dynamic path segment", () => {
    expect(encodePathSegment("id with / and ?")).toBe("id%20with%20%2F%20and%20%3F");
    expect(resourcePath("workflows", "id with /", "activate")).toBe(
      "/workflows/id%20with%20%2F/activate",
    );
  });
});

describe("createN8nFetch", () => {
  it("merges headers and builds against a normalized base URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com/api/v1/",
      authHeaders: { Authorization: "Bearer secret" },
      timeoutMs: 1_000,
      fetchImpl,
    });

    await request("/workflows?limit=1", { headers: { Accept: "application/json" } });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://n8n.example.com/api/v1/workflows?limit=1");
    expect(new Headers(init?.headers)).toMatchObject(new Headers({
      Accept: "application/json",
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    }));
  });

  it("does not allow a request to override configured authentication", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: { Authorization: "Bearer configured" },
      fetchImpl,
    });

    await request("/workflows", { headers: { Authorization: "Bearer attacker" } });

    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer configured");
  });

  it("refuses redirects even when a caller requests redirect following", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: { "X-N8N-API-KEY": "secret" },
      fetchImpl,
    });

    await request("/workflows", { redirect: "follow" });

    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("preserves encoded delimiters inside opaque resource IDs", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: {},
      fetchImpl,
    });

    await request(resourcePath("workflows", "wf/A"));

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://n8n.example.com/api/v1/workflows/wf%2FA",
    );
  });

  it("honors caller abort and always enforces its own timeout", async () => {
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: {},
      timeoutMs: 100,
      fetchImpl,
    });

    const caller = new AbortController();
    const callerRequest = request("/workflows", { signal: caller.signal });
    caller.abort(new Error("caller stopped"));
    await expect(callerRequest).rejects.toThrow("caller stopped");

    const timeoutRequest = request("/workflows", { signal: new AbortController().signal });
    await expect(timeoutRequest).rejects.toThrow();
    expect(signals).toHaveLength(2);
  });

  it("rejects a path that could escape the API base", async () => {
    const request = createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: {},
      fetchImpl: vi.fn(),
    });
    await expect(request("https://evil.example/path")).rejects.toThrow("relative API path");
    await expect(request("../admin")).rejects.toThrow("relative API path");
    await expect(request("/%2e%2e/admin")).rejects.toThrow("relative API path");
    await expect(request("/%zz/admin")).rejects.toThrow("valid root-relative API path");
  });

  it.each([99, 120_001, 100.5])("rejects invalid timeout %s", (timeoutMs) => {
    expect(() => createN8nFetch({
      baseUrl: "https://n8n.example.com",
      authHeaders: {},
      timeoutMs,
    })).toThrow("timeoutMs");
  });
});
