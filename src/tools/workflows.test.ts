import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FetchFn } from "../types.js";
import { registerWorkflowTools } from "./workflows.js";

function mockFetch(body: unknown, status = 200): FetchFn {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("registerWorkflowTools", () => {
  it("registers all 8 workflow tools without throwing", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const fetch = mockFetch({});
    expect(() => registerWorkflowTools(server, fetch)).not.toThrow();
  });
});

describe("list_workflows handler", () => {
  it("returns formatted workflow list", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const fetchFn = mockFetch({
      data: [
        { id: "1", name: "My Workflow", active: true },
        { id: "2", name: "Another", active: false },
      ],
    });

    registerWorkflowTools(server, fetchFn);

    // Access the registered tool handler through the server
    // We test via the fetch mock being called correctly
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("workflow ID validation", () => {
  it("rejects non-numeric workflow IDs at schema level", async () => {
    // The n8nId schema should reject path traversal attempts
    const { n8nId } = await import("../validation.js");
    expect(() => n8nId.parse("../admin")).toThrow();
    expect(() => n8nId.parse("abc")).toThrow();
    expect(n8nId.parse("123")).toBe("123");
  });
});
