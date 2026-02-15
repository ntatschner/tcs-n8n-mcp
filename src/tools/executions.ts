import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nExecutionSummary,
} from "../types.js";
import { n8nId, paginationCursor } from "../validation.js";

export function registerExecutionTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_executions ---
  server.tool(
    "list_executions",
    "List n8n workflow executions with optional filters for workflow ID and status.",
    {
      workflowId: n8nId.optional().describe("Filter by workflow ID"),
      status: z.enum(["error", "success", "waiting"]).optional().describe("Filter by execution status"),
      limit: z.number().int().positive().max(200).optional().default(20).describe("Max results (default 20)"),
      cursor: paginationCursor,
    },
    async ({ workflowId, status, limit, cursor }) => {
      const params = new URLSearchParams();
      if (workflowId) params.set("workflowId", workflowId);
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/executions?${params}`);
      if (!res.ok) return handleError(res, "listing executions");

      const json = await safeJson<N8nPaginatedResponse<N8nExecutionSummary>>(res);
      if (!json) return err("Failed to parse execution list response");

      const execs = json.data ?? [];
      const lines = (Array.isArray(execs) ? execs : []).map(
        (e: N8nExecutionSummary) =>
          `- #${e.id} | Workflow: ${e.workflowId} | Status: ${e.status} | Started: ${e.startedAt ?? "N/A"} | Finished: ${e.stoppedAt ?? "running"}`
      );
      const next = json.nextCursor ? `\nNext cursor: ${json.nextCursor}` : "";
      return ok(`Found ${lines.length} executions:\n${lines.join("\n")}${next}`);
    }
  );

  // --- get_execution ---
  server.tool(
    "get_execution",
    "Get full details of an n8n execution including node results and error data.",
    {
      executionId: n8nId.describe("ID of the execution"),
    },
    async ({ executionId }) => {
      const res = await n8nFetch(`/executions/${executionId}`);
      if (!res.ok) return handleError(res, "fetching execution");

      const exec = await safeJson<Record<string, unknown>>(res);
      if (!exec) return err("Failed to parse execution response");
      return ok(JSON.stringify(exec, null, 2));
    }
  );

  // --- delete_execution ---
  server.tool(
    "delete_execution",
    "Delete an n8n execution record by ID.",
    { executionId: n8nId.describe("ID of the execution to delete") },
    async ({ executionId }) => {
      const res = await n8nFetch(`/executions/${executionId}`, { method: "DELETE" });
      if (!res.ok) return handleError(res, "deleting execution");
      return ok(`Deleted execution ${executionId}`);
    }
  );
}
