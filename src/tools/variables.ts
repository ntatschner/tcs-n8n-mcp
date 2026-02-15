import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nVariable,
} from "../types.js";
import { n8nId, paginationCursor } from "../validation.js";

export function registerVariableTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_variables ---
  server.tool(
    "list_variables",
    "List all n8n environment variables (values are masked for security).",
    {
      limit: z.number().int().positive().max(200).optional().default(50).describe("Max results"),
      cursor: paginationCursor,
    },
    async ({ limit, cursor }) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/variables?${params}`);
      if (!res.ok) return handleError(res, "listing variables");

      const json = await safeJson<N8nPaginatedResponse<N8nVariable>>(res);
      if (!json) return err("Failed to parse variable list response");

      const vars = json.data ?? [];
      const lines = (Array.isArray(vars) ? vars : []).map(
        (v: N8nVariable) => `- ${v.key} (ID: ${v.id})`
      );
      return ok(`Found ${lines.length} variables:\n${lines.join("\n")}`);
    }
  );

  // --- create_variable ---
  server.tool(
    "create_variable",
    "Create a new n8n environment variable (key-value pair).",
    {
      key: z.string().describe("Variable key/name"),
      value: z.string().describe("Variable value"),
    },
    async ({ key, value }) => {
      const res = await n8nFetch("/variables", { method: "POST", body: JSON.stringify({ key, value }) });
      if (!res.ok) return handleError(res, "creating variable");

      const v = await safeJson<N8nVariable>(res);
      if (!v) return err("Failed to parse create variable response");
      return ok(`Created variable "${v.key}" (ID: ${v.id})`);
    }
  );

  // --- update_variable ---
  server.tool(
    "update_variable",
    "Update an existing n8n environment variable.",
    {
      variableId: n8nId.describe("ID of the variable to update"),
      key: z.string().optional().describe("New key name"),
      value: z.string().optional().describe("New value"),
    },
    async ({ variableId, key, value }) => {
      const body: Record<string, string> = {};
      if (key !== undefined) body.key = key;
      if (value !== undefined) body.value = value;

      const res = await n8nFetch(`/variables/${variableId}`, { method: "PUT", body: JSON.stringify(body) });
      if (!res.ok) return handleError(res, "updating variable");

      const v = await safeJson<N8nVariable>(res);
      if (!v) return err("Failed to parse update variable response");
      return ok(`Updated variable "${v.key}" (ID: ${v.id})`);
    }
  );

  // --- delete_variable ---
  server.tool(
    "delete_variable",
    "Delete an n8n environment variable by ID.",
    { variableId: n8nId.describe("ID of the variable to delete") },
    async ({ variableId }) => {
      const res = await n8nFetch(`/variables/${variableId}`, { method: "DELETE" });
      if (!res.ok) return handleError(res, "deleting variable");
      return ok(`Deleted variable ${variableId}`);
    }
  );
}
