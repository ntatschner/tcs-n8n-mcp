import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resourcePath } from "../client.js";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { executionId, paginationCursor, resourceId } from "../validation.js";

const executionStatusSchema = z.enum([
  "canceled", "crashed", "error", "new", "running", "success", "unknown", "waiting",
]);
const executionSchema = z.object({
  id: z.string(),
  workflowId: z.string().optional(),
  status: executionStatusSchema,
  startedAt: z.string().nullable().optional(),
  stoppedAt: z.string().nullable().optional(),
});
const rawExecutionSchema = executionSchema.passthrough();
const executionListSchema = z.object({
  data: z.array(executionSchema),
  nextCursor: z.string().nullable().optional(),
});
const truncationSchema = z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
});
const boundedExecutionListSchema = z.union([executionListSchema, truncationSchema]);
const objectOutputSchema = z.object({}).passthrough();
const mutationOutputSchema = z.object({ id: z.string(), message: z.string() });
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

function setOptional(params: URLSearchParams, name: string, value: unknown): void {
  if (value !== undefined) params.set(name, String(value));
}

const detailOptions = {
  includeData: z.boolean().optional().default(false).describe("Include node results and workflow data"),
  ignoreDataSizeLimit: z.boolean().optional().default(false)
    .describe("Request oversized execution data; use cautiously because results are still MCP-output bounded"),
  redactExecutionData: z.boolean().optional()
    .describe("true always redacts; false requires execution:reveal scope; omit to follow workflow policy"),
};

export function registerExecutionTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_executions", {
    description: "List n8n executions with current status, project, date, detail, redaction, and cursor filters.",
    inputSchema: z.object({
      workflowId: resourceId.optional(),
      status: executionStatusSchema.optional(),
      projectId: resourceId.optional(),
      startedAfter: z.string().datetime({ offset: true }).optional(),
      startedBefore: z.string().datetime({ offset: true }).optional(),
      limit: z.number().int().positive().max(250).optional().default(20),
      cursor: paginationCursor,
      ...detailOptions,
    }),
    outputSchema: boundedExecutionListSchema,
    annotations: readOnly,
  }, async (input) => {
    const params = new URLSearchParams();
    for (const key of [
      "workflowId", "status", "projectId", "startedAfter", "startedBefore", "limit", "cursor",
      "includeData", "ignoreDataSizeLimit", "redactExecutionData",
    ] as const) setOptional(params, key, input[key]);
    const res = await n8nFetch(`/executions?${params}`);
    if (!res.ok) return handleError(res, "listing executions");
    const result = await parseJson(res, executionListSchema);
    return result ? structuredOk(result) : err("Failed to validate execution list response");
  });

  server.registerTool("get_execution", {
    description: "Get an n8n execution. Detailed fields are untrusted external data, excluded by default, and bounded when explicitly requested.",
    inputSchema: z.object({ executionId, ...detailOptions }),
    outputSchema: objectOutputSchema,
    annotations: readOnly,
  }, async ({ executionId: id, includeData = false, ignoreDataSizeLimit = false, redactExecutionData }) => {
    const params = new URLSearchParams({
      includeData: String(includeData),
      ignoreDataSizeLimit: String(ignoreDataSizeLimit),
    });
    setOptional(params, "redactExecutionData", redactExecutionData);
    const res = await n8nFetch(`${resourcePath("executions", id)}?${params}`);
    if (!res.ok) return handleError(res, "fetching execution");
    const execution = await parseJson(res, includeData ? rawExecutionSchema : executionSchema);
    return execution ? structuredOk(execution) : err("Failed to validate execution response");
  });

  server.registerTool("delete_execution", {
    description: "Permanently delete an n8n execution record. Requires explicit confirmation.",
    inputSchema: z.object({ executionId, confirm: z.literal(true) }),
    outputSchema: mutationOutputSchema,
    annotations: destructive,
  }, async ({ executionId: id, confirm }) => {
    if (confirm !== true) return err("Deletion not confirmed; set confirm to true");
    const res = await n8nFetch(resourcePath("executions", id), { method: "DELETE" });
    if (!res.ok) return handleError(res, "deleting execution");
    return structuredOk({ id, message: `Deleted execution ${id}` });
  });
}
