import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nWorkflowSummary, type N8nExecutionResult,
} from "../types.js";
import { n8nId, paginationCursor } from "../validation.js";

const nodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()).optional().default({}),
  onError: z.string().optional().describe("Error handling: 'continueRegularOutput' | 'continueErrorOutput' | 'stopWorkflow'"),
  credentials: z.record(z.unknown()).optional().describe("Credential references for this node"),
  webhookId: z.string().optional().describe("Webhook ID for trigger nodes"),
});

export function registerWorkflowTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_workflows ---
  server.tool(
    "list_workflows",
    "List all n8n workflows with optional name filter and pagination.",
    {
      limit: z.number().int().positive().max(200).optional().default(50).describe("Max results (default 50)"),
      cursor: paginationCursor,
    },
    async ({ limit, cursor }) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/workflows?${params}`);
      if (!res.ok) return handleError(res, "listing workflows");

      const json = await safeJson<N8nPaginatedResponse<N8nWorkflowSummary>>(res);
      if (!json) return err("Failed to parse workflow list response");

      const workflows = json.data ?? [];
      const lines = (Array.isArray(workflows) ? workflows : []).map(
        (w: N8nWorkflowSummary) => `- ${w.name} (ID: ${w.id}, Active: ${w.active})`
      );
      const next = json.nextCursor ? `\nNext cursor: ${json.nextCursor}` : "";
      return ok(`Found ${lines.length} workflows:\n${lines.join("\n")}${next}`);
    }
  );

  // --- get_workflow ---
  server.tool(
    "get_workflow",
    "Get full details of an n8n workflow by ID, including nodes, connections, and settings.",
    {
      workflowId: n8nId.describe("ID of the workflow"),
    },
    async ({ workflowId }) => {
      const res = await n8nFetch(`/workflows/${workflowId}`);
      if (!res.ok) return handleError(res, "fetching workflow");

      const w = await safeJson<Record<string, unknown>>(res);
      if (!w) return err("Failed to parse workflow response");
      return ok(JSON.stringify(w, null, 2));
    }
  );

  // --- create_workflow ---
  server.tool(
    "create_workflow",
    "Create a new n8n workflow. Provide a name and optionally nodes/connections. Defaults to a Manual Trigger node if no nodes given.",
    {
      name: z.string().describe("Workflow name"),
      nodes: z.array(nodeSchema).optional().describe("Array of workflow nodes (defaults to Manual Trigger)"),
      connections: z.record(z.unknown()).optional().default({}).describe("Node connections mapping"),
      settings: z.record(z.unknown()).optional().default({}).describe("Workflow settings"),
    },
    async ({ name, nodes, connections, settings }) => {
      const defaultNodes = [
        {
          id: "trigger-1",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
      ];

      const body = { name, nodes: nodes ?? defaultNodes, connections: connections ?? {}, settings: settings ?? {} };
      const res = await n8nFetch("/workflows", { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) return handleError(res, "creating workflow");

      const w = await safeJson<N8nWorkflowSummary>(res);
      if (!w) return err("Failed to parse create workflow response");
      return ok(`Created workflow "${w.name}" (ID: ${w.id}, Active: ${w.active})`);
    }
  );

  // --- update_workflow ---
  server.tool(
    "update_workflow",
    "Update an existing n8n workflow. Provide the workflow ID and any fields to change.",
    {
      workflowId: n8nId.describe("ID of the workflow to update"),
      name: z.string().optional().describe("New workflow name"),
      nodes: z.array(nodeSchema).optional().describe("Updated nodes array"),
      connections: z.record(z.unknown()).optional().describe("Updated connections"),
      settings: z.record(z.unknown()).optional().describe("Updated settings"),
    },
    async ({ workflowId, name, nodes, connections, settings }) => {
      const getRes = await n8nFetch(`/workflows/${workflowId}`);
      if (!getRes.ok) return handleError(getRes, "fetching workflow for update");

      const current = await safeJson<Record<string, unknown>>(getRes);
      if (!current) return err("Failed to parse current workflow for update");

      const body: Record<string, unknown> = {
        name: name ?? current.name,
        nodes: nodes ?? current.nodes,
        connections: connections ?? current.connections,
        settings: settings ?? current.settings,
      };

      const res = await n8nFetch(`/workflows/${workflowId}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) return handleError(res, "updating workflow");

      const w = await safeJson<N8nWorkflowSummary>(res);
      if (!w) return err("Failed to parse update workflow response");
      return ok(`Updated workflow "${w.name}" (ID: ${w.id})`);
    }
  );

  // --- delete_workflow ---
  server.tool(
    "delete_workflow",
    "Delete an n8n workflow by ID. This is irreversible.",
    { workflowId: n8nId.describe("ID of the workflow to delete") },
    async ({ workflowId }) => {
      const res = await n8nFetch(`/workflows/${workflowId}`, { method: "DELETE" });
      if (!res.ok) return handleError(res, "deleting workflow");
      return ok(`Deleted workflow ${workflowId}`);
    }
  );

  // --- activate_workflow ---
  server.tool(
    "activate_workflow",
    "Activate an n8n workflow so it runs on its configured triggers.",
    { workflowId: n8nId.describe("ID of the workflow to activate") },
    async ({ workflowId }) => {
      const res = await n8nFetch(`/workflows/${workflowId}/activate`, { method: "POST" });
      if (!res.ok) return handleError(res, "activating workflow");
      return ok(`Activated workflow ${workflowId}`);
    }
  );

  // --- deactivate_workflow ---
  server.tool(
    "deactivate_workflow",
    "Deactivate an n8n workflow so it stops running on triggers.",
    { workflowId: n8nId.describe("ID of the workflow to deactivate") },
    async ({ workflowId }) => {
      const res = await n8nFetch(`/workflows/${workflowId}/deactivate`, { method: "POST" });
      if (!res.ok) return handleError(res, "deactivating workflow");
      return ok(`Deactivated workflow ${workflowId}`);
    }
  );

  // --- execute_workflow ---
  server.tool(
    "execute_workflow",
    "Execute an n8n workflow immediately and return the execution ID. The workflow runs asynchronously.",
    { workflowId: n8nId.describe("ID of the workflow to execute") },
    async ({ workflowId }) => {
      const res = await n8nFetch(`/workflows/${workflowId}/execute`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) return handleError(res, "executing workflow");

      const result = await safeJson<N8nExecutionResult>(res);
      if (!result) return err("Failed to parse execution response");
      return ok(
        `Execution started for workflow ${workflowId} (Execution ID: ${result.executionId})`
      );
    }
  );
}
