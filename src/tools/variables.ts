import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resourcePath } from "../client.js";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { paginationCursor, resourceId } from "../validation.js";

const variableResponseSchema = z.object({
  id: z.string(), key: z.string(), value: z.string().optional(),
  projectId: z.string().optional(),
  project: z.object({ id: z.string() }).passthrough().optional(),
}).passthrough();
const safeVariableSchema = z.object({
  id: z.string(), key: z.string(), projectId: z.string().optional(),
  project: z.object({ id: z.string() }).optional(),
});
const listResponseSchema = z.object({
  data: z.array(variableResponseSchema), nextCursor: z.string().nullable().optional(),
});
const safeListSchema = z.object({
  data: z.array(safeVariableSchema), nextCursor: z.string().nullable().optional(),
});
const boundedSafeListSchema = z.union([safeListSchema, z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
})]);
const mutationSchema = z.object({
  id: z.string().optional(), key: z.string().optional(), message: z.string(),
});
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

export function registerVariableTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_variables", {
    description: "List n8n variables without exposing their values.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(250).optional().default(50),
      cursor: paginationCursor,
      projectId: resourceId.optional(),
      state: z.literal("empty").optional(),
    }),
    outputSchema: boundedSafeListSchema,
    annotations: readOnly,
  }, async ({ limit = 50, cursor, projectId, state }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) params.set("cursor", cursor);
    if (projectId !== undefined) params.set("projectId", projectId);
    if (state !== undefined) params.set("state", state);
    const res = await n8nFetch(`/variables?${params}`);
    if (!res.ok) return handleError(res, "listing variables");
    const result = await parseJson(res, listResponseSchema);
    if (!result) return err("Failed to validate variable list response");
    return structuredOk({
      data: result.data.map(({ id, key, projectId: ownerProjectId, project }) => ({
        id, key,
        ...(ownerProjectId === undefined ? {} : { projectId: ownerProjectId }),
        ...(project === undefined ? {} : { project: { id: project.id } }),
      })),
      nextCursor: result.nextCursor,
    });
  });

  server.registerTool("create_variable", {
    description: "Create an n8n variable, optionally in a specified project.",
    inputSchema: z.object({
      key: z.string().min(1).max(50).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      value: z.string().max(1000),
      projectId: resourceId.max(36).optional(),
    }),
    outputSchema: mutationSchema,
    annotations: write,
  }, async ({ key, value, projectId }) => {
    const body = { key, value, ...(projectId === undefined ? {} : { projectId }) };
    const res = await n8nFetch("/variables", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) return handleError(res, "creating variable");
    if (res.status === 204 || res.body === null || res.headers.get("content-length") === "0") {
      return structuredOk({ key, message: `Created variable "${key}"` });
    }
    const variable = await parseJson(res, variableResponseSchema);
    return variable
      ? structuredOk({ id: variable.id, key: variable.key, message: `Created variable "${variable.key}"` })
      : err("Failed to validate create variable response");
  });

  server.registerTool("update_variable", {
    description: "Replace both the key and value of an existing n8n variable.",
    inputSchema: z.object({
      variableId: resourceId,
      key: z.string().min(1).max(50).regex(/^[A-Za-z0-9_]+$/),
      value: z.string().max(1000),
      projectId: resourceId.max(36).nullable().optional(),
    }),
    outputSchema: mutationSchema,
    annotations: { ...write, idempotentHint: true },
  }, async ({ variableId, key, value, projectId }) => {
    const body = { key, value, ...(projectId === undefined ? {} : { projectId }) };
    const res = await n8nFetch(resourcePath("variables", variableId), {
      method: "PUT", body: JSON.stringify(body),
    });
    if (!res.ok) return handleError(res, "updating variable");
    if (res.status === 204 || res.body === null || res.headers.get("content-length") === "0") {
      return structuredOk({ id: variableId, key, message: `Updated variable "${key}"` });
    }
    const variable = await parseJson(res, variableResponseSchema);
    return variable
      ? structuredOk({ id: variable.id, key: variable.key, message: `Updated variable "${variable.key}"` })
      : err("Failed to validate update variable response");
  });

  server.registerTool("delete_variable", {
    description: "Permanently delete an n8n variable. Requires explicit confirmation.",
    inputSchema: z.object({ variableId: resourceId, confirm: z.literal(true) }),
    outputSchema: mutationSchema,
    annotations: { ...write, destructiveHint: true },
  }, async ({ variableId, confirm }) => {
    if (confirm !== true) return err("Deletion not confirmed; set confirm to true");
    const res = await n8nFetch(resourcePath("variables", variableId), { method: "DELETE" });
    if (!res.ok) return handleError(res, "deleting variable");
    return structuredOk({ id: variableId, message: `Deleted variable ${variableId}` });
  });
}
