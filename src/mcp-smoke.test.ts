import { describe, expect, it, vi } from "vitest";
import { createN8nFetch } from "./client.js";
import { createServer } from "./server.js";
import { createTestClient } from "./test-utils.js";
import type { FetchFn } from "./types.js";

function apiResponse(path: string, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  if (method === "DELETE" || path.includes("/activate") || path.includes("/deactivate")) {
    return new Response(null, { status: 204 });
  }
  if (path.startsWith("/workflows")) {
    if (method === "POST" || method === "PUT") {
      return Response.json({ id: "wf1", name: "Workflow", active: false });
    }
    if (!path.match(/^\/workflows\/[^?]+/)) return Response.json({ data: [], nextCursor: null });
    return Response.json({ id: "wf1", name: "Workflow", active: false, nodes: [], connections: {}, settings: {} });
  }
  if (path.startsWith("/executions")) {
    return path.startsWith("/executions?")
      ? Response.json({ data: [], nextCursor: null })
      : Response.json({ id: "42", status: "success" });
  }
  if (path.startsWith("/tags")) {
    return path.startsWith("/tags?")
      ? Response.json({ data: [], nextCursor: null })
      : Response.json({ id: "tag1", name: "Tag" });
  }
  if (path.startsWith("/variables")) {
    return path.startsWith("/variables?")
      ? Response.json({ data: [], nextCursor: null })
      : new Response(null, { status: 204 });
  }
  if (path.startsWith("/credentials")) return Response.json({ data: [], nextCursor: null });
  if (path.startsWith("/users?")) return Response.json({ data: [], nextCursor: null });
  if (path.startsWith("/users/")) return Response.json({ id: "u1", email: "u@example.com" });
  return new Response("Not found", { status: 404, statusText: "Not Found" });
}

describe("MCP v2 in-memory smoke test", () => {
  it("negotiates a connection and exposes every registered n8n tool", async () => {
    const server = createServer(vi.fn());
    const client = await createTestClient(server);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(21);
      expect(tools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
      expect(tools.every((tool) => tool.annotations !== undefined)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("invokes every tool through MCP input and output validation", async () => {
    const fetchFn: FetchFn = vi.fn(async (path, init) => apiResponse(path, init));
    const client = await createTestClient(createServer(fetchFn));
    const calls = [
      ["list_workflows", {}],
      ["get_workflow", { workflowId: "wf1" }],
      ["create_workflow", { name: "Workflow", nodes: [], connections: {}, settings: {} }],
      ["update_workflow", { workflowId: "wf1", name: "Updated" }],
      ["delete_workflow", { workflowId: "wf1", confirm: true }],
      ["activate_workflow", { workflowId: "wf1" }],
      ["deactivate_workflow", { workflowId: "wf1" }],
      ["list_executions", {}],
      ["get_execution", { executionId: "42" }],
      ["delete_execution", { executionId: "42", confirm: true }],
      ["list_tags", {}],
      ["create_tag", { name: "Tag" }],
      ["update_tag", { tagId: "tag1", name: "Tag" }],
      ["delete_tag", { tagId: "tag1", confirm: true }],
      ["list_variables", {}],
      ["create_variable", { key: "KEY", value: "value" }],
      ["update_variable", { variableId: "v1", key: "KEY", value: "value" }],
      ["delete_variable", { variableId: "v1", confirm: true }],
      ["list_credentials", {}],
      ["list_users", {}],
      ["get_user", { userIdOrEmail: "u1" }],
    ] as const;
    try {
      for (const [name, args] of calls) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError, name).not.toBe(true);
      }
    } finally {
      await client.close();
    }
  });

  it("accepts an opaque slash ID and keeps it encoded through the HTTP client", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "wf/A", name: "Workflow" }));
    const fetchFn = createN8nFetch({
      baseUrl: "https://n8n.example.test",
      authHeaders: { "X-N8N-API-KEY": "secret" },
      fetchImpl,
    });
    const client = await createTestClient(createServer(fetchFn));
    try {
      const result = await client.callTool({
        name: "get_workflow",
        arguments: { workflowId: "wf/A" },
      });
      expect(result.isError).not.toBe(true);
      expect(fetchImpl.mock.calls[0][0]).toBe(
        "https://n8n.example.test/api/v1/workflows/wf%2FA?excludePinnedData=true",
      );
    } finally {
      await client.close();
    }
  });
});
