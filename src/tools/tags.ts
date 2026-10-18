import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resourcePath } from "../client.js";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { paginationCursor, resourceId } from "../validation.js";

const tagSchema = z.object({ id: z.string(), name: z.string() }).passthrough();
const listSchema = z.object({ data: z.array(tagSchema), nextCursor: z.string().nullable().optional() });
const truncationSchema = z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
});
const boundedTagSchema = z.union([tagSchema, truncationSchema]);
const boundedListSchema = z.union([listSchema, truncationSchema]);
const mutationSchema = z.object({ id: z.string(), message: z.string() }).passthrough();
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

export function registerTagTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_tags", {
    description: "List n8n tags with cursor pagination.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(250).optional().default(50),
      cursor: paginationCursor,
    }),
    outputSchema: boundedListSchema,
    annotations: readOnly,
  }, async ({ limit = 50, cursor }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) params.set("cursor", cursor);
    const res = await n8nFetch(`/tags?${params}`);
    if (!res.ok) return handleError(res, "listing tags");
    const result = await parseJson(res, listSchema);
    return result ? structuredOk(result) : err("Failed to validate tag list response");
  });

  server.registerTool("create_tag", {
    description: "Create a tag for organizing n8n workflows.",
    inputSchema: z.object({ name: z.string().min(1) }),
    outputSchema: boundedTagSchema,
    annotations: write,
  }, async ({ name }) => {
    const res = await n8nFetch("/tags", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) return handleError(res, "creating tag");
    const tag = await parseJson(res, tagSchema);
    return tag ? structuredOk(tag) : err("Failed to validate create tag response");
  });

  server.registerTool("update_tag", {
    description: "Rename an n8n tag.",
    inputSchema: z.object({ tagId: resourceId, name: z.string().min(1) }),
    outputSchema: boundedTagSchema,
    annotations: { ...write, idempotentHint: true },
  }, async ({ tagId, name }) => {
    const res = await n8nFetch(resourcePath("tags", tagId), { method: "PUT", body: JSON.stringify({ name }) });
    if (!res.ok) return handleError(res, "updating tag");
    const tag = await parseJson(res, tagSchema);
    return tag ? structuredOk(tag) : err("Failed to validate update tag response");
  });

  server.registerTool("delete_tag", {
    description: "Permanently delete an n8n tag. Requires explicit confirmation.",
    inputSchema: z.object({ tagId: resourceId, confirm: z.literal(true) }),
    outputSchema: mutationSchema,
    annotations: { ...write, destructiveHint: true },
  }, async ({ tagId, confirm }) => {
    if (confirm !== true) return err("Deletion not confirmed; set confirm to true");
    const res = await n8nFetch(resourcePath("tags", tagId), { method: "DELETE" });
    if (!res.ok) return handleError(res, "deleting tag");
    return structuredOk({ id: tagId, message: `Deleted tag ${tagId}` });
  });
}
