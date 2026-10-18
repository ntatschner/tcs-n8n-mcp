import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { paginationCursor } from "../validation.js";

const credentialSchema = z.object({
  id: z.string(), name: z.string(), type: z.string(), createdAt: z.string().optional(),
});
const listSchema = z.object({
  data: z.array(credentialSchema), nextCursor: z.string().nullable().optional(),
});
const boundedListSchema = z.union([listSchema, z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
})]);

export function registerCredentialTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_credentials", {
    description: "List n8n credential metadata only; secret credential data is never returned.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(250).optional().default(50),
      cursor: paginationCursor,
    }),
    outputSchema: boundedListSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ limit = 50, cursor }) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== undefined) params.set("cursor", cursor);
    const res = await n8nFetch(`/credentials?${params}`);
    if (!res.ok) return handleError(res, "listing credentials");
    const result = await parseJson(res, listSchema);
    return result ? structuredOk(result) : err("Failed to validate credential list response");
  });
}
