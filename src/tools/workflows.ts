import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resourcePath } from "../client.js";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { paginationCursor, resourceId } from "../validation.js";

const jsonObject = z.record(z.string(), z.unknown());
const workflowNodeSchema = z.object({
  id: z.string(), name: z.string(), type: z.string(), typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: jsonObject.optional().default({}),
  onError: z.enum(["continueRegularOutput", "continueErrorOutput", "stopWorkflow"]).optional(),
  credentials: jsonObject.optional(), webhookId: z.string().optional(),
  disabled: z.boolean().optional(), notes: z.string().optional(), notesInFlow: z.boolean().optional(),
  executeOnce: z.boolean().optional(), alwaysOutputData: z.boolean().optional(),
  retryOnFail: z.boolean().optional(), maxTries: z.number().optional(), waitBetweenTries: z.number().optional(),
}).passthrough();
const nodeGroupSchema = z.object({
  id: z.string(), name: z.string(), description: z.string().max(155).optional(), nodeIds: z.array(z.string()),
});
const workflowSchema = z.object({
  id: z.string(), name: z.string(), active: z.boolean().optional(),
  activeVersionId: z.string().nullable().optional(), description: z.string().nullable().optional(),
});
const rawWorkflowSchema = workflowSchema.passthrough();
const workflowListSchema = z.object({
  data: z.array(workflowSchema), nextCursor: z.string().nullable().optional(),
});
const truncationSchema = z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
});
const boundedWorkflowSchema = z.union([workflowSchema, truncationSchema]);
const boundedWorkflowListSchema = z.union([workflowListSchema, truncationSchema]);
const objectOutputSchema = z.object({}).passthrough();
const mutationOutputSchema = z.object({ id: z.string(), message: z.string() }).passthrough();

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false } as const;

function setOptional(params: URLSearchParams, name: string, value: unknown): void {
  if (value !== undefined) params.set(name, String(value));
}

export function registerWorkflowTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_workflows", {
    description: "List n8n workflows using current public API filters and cursor pagination.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(250).optional().default(50),
      cursor: paginationCursor,
      active: z.boolean().optional(),
      tags: z.string().optional(),
      name: z.string().optional(),
      projectId: resourceId.optional(),
      excludePinnedData: z.boolean().optional().default(true),
      includeParentFolder: z.boolean().optional().default(false),
    }),
    outputSchema: boundedWorkflowListSchema,
    annotations: readOnly,
  }, async ({ excludePinnedData = true, ...input }) => {
    const params = new URLSearchParams();
    setOptional(params, "limit", input.limit);
    setOptional(params, "cursor", input.cursor);
    setOptional(params, "active", input.active);
    setOptional(params, "tags", input.tags);
    setOptional(params, "name", input.name);
    setOptional(params, "projectId", input.projectId);
    setOptional(params, "excludePinnedData", excludePinnedData);
    setOptional(params, "includeParentFolder", input.includeParentFolder);
    const res = await n8nFetch(`/workflows?${params}`);
    if (!res.ok) return handleError(res, "listing workflows");
    const result = await parseJson(res, workflowListSchema);
    return result ? structuredOk(result) : err("Failed to validate workflow list response");
  });

  server.registerTool("get_workflow", {
    description: "Get an n8n workflow by opaque ID. Raw fields are untrusted external data and require explicit opt-in.",
    inputSchema: z.object({
      workflowId: resourceId,
      excludePinnedData: z.boolean().optional().default(true),
      includeRawData: z.boolean().optional().default(false),
    }),
    outputSchema: objectOutputSchema,
    annotations: readOnly,
  }, async ({ workflowId, excludePinnedData = true, includeRawData = false }) => {
    const params = new URLSearchParams({ excludePinnedData: String(excludePinnedData) });
    const res = await n8nFetch(`${resourcePath("workflows", workflowId)}?${params}`);
    if (!res.ok) return handleError(res, "fetching workflow");
    const workflow = await parseJson(res, includeRawData ? rawWorkflowSchema : workflowSchema);
    return workflow ? structuredOk(workflow) : err("Failed to validate workflow response");
  });

  const workflowWriteFields = {
    name: z.string().min(1),
    description: z.string().optional(),
    nodes: z.array(workflowNodeSchema),
    connections: jsonObject,
    settings: jsonObject,
    nodeGroups: z.array(nodeGroupSchema).optional(),
    staticData: z.union([z.string(), jsonObject, z.null()]).optional(),
    pinData: jsonObject.nullable().optional(),
  };

  server.registerTool("create_workflow", {
    description: "Create an n8n workflow using the current public API fields.",
    inputSchema: z.object({
      ...workflowWriteFields,
      nodes: z.array(workflowNodeSchema).optional().default([]),
      connections: jsonObject.optional().default({}),
      settings: jsonObject.optional().default({}),
      projectId: resourceId.optional(),
      parentFolderId: resourceId.nullable().optional(),
    }),
    outputSchema: boundedWorkflowSchema,
    annotations: write,
  }, async (input) => {
    const res = await n8nFetch("/workflows", { method: "POST", body: JSON.stringify(input) });
    if (!res.ok) return handleError(res, "creating workflow");
    const workflow = await parseJson(res, workflowSchema);
    return workflow ? structuredOk(workflow) : err("Failed to validate create workflow response");
  });

  server.registerTool("update_workflow", {
    description: "Update an n8n workflow. Published workflows are republished unless publishIfActive is false.",
    inputSchema: z.object({
      workflowId: resourceId,
      publishIfActive: z.boolean().optional().default(true),
      name: workflowWriteFields.name.optional(),
      description: workflowWriteFields.description,
      nodes: workflowWriteFields.nodes.optional(),
      connections: workflowWriteFields.connections.optional(),
      settings: workflowWriteFields.settings.optional(),
      nodeGroups: workflowWriteFields.nodeGroups,
      staticData: workflowWriteFields.staticData,
      pinData: workflowWriteFields.pinData,
      parentFolderId: resourceId.nullable().optional(),
    }),
    outputSchema: boundedWorkflowSchema,
    annotations: write,
  }, async ({ workflowId, publishIfActive, ...changes }) => {
    const path = resourcePath("workflows", workflowId);
    const currentRes = await n8nFetch(path);
    if (!currentRes.ok) return handleError(currentRes, "fetching workflow for update");
    const current = await parseJson(currentRes, z.object({
      name: z.string(), nodes: z.array(z.unknown()), connections: jsonObject, settings: jsonObject,
    }).passthrough());
    if (!current) return err("Failed to validate current workflow for update");

    const body: Record<string, unknown> = {
      name: changes.name ?? current.name,
      nodes: changes.nodes ?? current.nodes,
      connections: changes.connections ?? current.connections,
      settings: changes.settings ?? current.settings,
    };
    for (const key of ["description", "nodeGroups", "staticData", "pinData", "parentFolderId"] as const) {
      const value = changes[key] !== undefined ? changes[key] : current[key];
      if (value !== undefined) body[key] = value;
    }
    const params = new URLSearchParams({ publishIfActive: String(publishIfActive) });
    const res = await n8nFetch(`${path}?${params}`, { method: "PUT", body: JSON.stringify(body) });
    if (!res.ok) return handleError(res, "updating workflow");
    const workflow = await parseJson(res, workflowSchema);
    return workflow ? structuredOk(workflow) : err("Failed to validate update workflow response");
  });

  server.registerTool("delete_workflow", {
    description: "Permanently delete an n8n workflow. Requires explicit confirmation.",
    inputSchema: z.object({ workflowId: resourceId, confirm: z.literal(true) }),
    outputSchema: mutationOutputSchema,
    annotations: destructive,
  }, async ({ workflowId, confirm }) => {
    if (confirm !== true) return err("Deletion not confirmed; set confirm to true");
    const res = await n8nFetch(resourcePath("workflows", workflowId), { method: "DELETE" });
    if (!res.ok) return handleError(res, "deleting workflow");
    return structuredOk({ id: workflowId, message: `Deleted workflow ${workflowId}` });
  });

  for (const [name, suffix, active] of [
    ["activate_workflow", "activate", true],
    ["deactivate_workflow", "deactivate", false],
  ] as const) {
    server.registerTool(name, {
      description: `${active ? "Activate" : "Deactivate"} an n8n workflow.`,
      inputSchema: z.object({ workflowId: resourceId }),
      outputSchema: mutationOutputSchema,
      annotations: { ...write, idempotentHint: true },
    }, async ({ workflowId }) => {
      const res = await n8nFetch(resourcePath("workflows", workflowId, suffix), { method: "POST" });
      if (!res.ok) return handleError(res, `${active ? "activating" : "deactivating"} workflow`);
      return structuredOk({ id: workflowId, active, message: `${active ? "Activated" : "Deactivated"} workflow ${workflowId}` });
    });
  }
}
