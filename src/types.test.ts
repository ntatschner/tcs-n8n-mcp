import { describe, it, expect } from "vitest";
import { ok, err, handleError, safeJson } from "./types.js";

describe("ok", () => {
  it("returns MCP text content", () => {
    const result = ok("hello");
    expect(result).toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("does not set isError", () => {
    const result = ok("test");
    expect(result).not.toHaveProperty("isError");
  });
});

describe("err", () => {
  it("returns MCP text content with isError true", () => {
    const result = err("something failed");
    expect(result).toEqual({
      content: [{ type: "text", text: "something failed" }],
      isError: true,
    });
  });
});

describe("handleError", () => {
  it("returns sanitised error with status code", async () => {
    const res = new Response("secret internal details", {
      status: 404,
      statusText: "Not Found",
    });
    const result = await handleError(res, "fetching workflow");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error fetching workflow: HTTP 404 Not Found");
  });

  it("does not include raw response body", async () => {
    const res = new Response("stack trace with /home/user/.n8n/config", {
      status: 500,
      statusText: "Internal Server Error",
    });
    const result = await handleError(res, "listing workflows");
    expect(result.content[0].text).not.toContain("stack trace");
    expect(result.content[0].text).not.toContain("/home/user");
  });

  it("handles missing statusText", async () => {
    const res = new Response("error", { status: 502 });
    const result = await handleError(res, "test");
    expect(result.content[0].text).toContain("HTTP 502");
  });
});

describe("safeJson", () => {
  it("parses valid JSON response", async () => {
    const res = new Response(JSON.stringify({ id: "1", name: "test" }));
    const result = await safeJson<{ id: string; name: string }>(res);
    expect(result).toEqual({ id: "1", name: "test" });
  });

  it("returns null for invalid JSON", async () => {
    const res = new Response("not json {{{");
    const result = await safeJson(res);
    expect(result).toBeNull();
  });

  it("returns null for empty body", async () => {
    const res = new Response("");
    const result = await safeJson(res);
    expect(result).toBeNull();
  });
});
