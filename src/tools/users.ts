import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { resourcePath } from "../client.js";
import type { FetchFn } from "../types.js";
import { err, handleError, parseJson, structuredOk } from "../types.js";
import { paginationCursor, resourceId, userIdentifier } from "../validation.js";

const userSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  role: z.string().optional(),
}).passthrough();
const listSchema = z.object({ data: z.array(userSchema), nextCursor: z.string().nullable().optional() });
const truncationSchema = z.object({
  truncated: z.literal(true), originalCharacters: z.number(), message: z.string(),
});
const boundedUserSchema = z.union([userSchema, truncationSchema]);
const boundedListSchema = z.union([listSchema, truncationSchema]);
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;

export function registerUserTools(server: McpServer, n8nFetch: FetchFn) {
  server.registerTool("list_users", {
    description: "List n8n users, optionally including roles or restricting results to a project.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(250).optional().default(50),
      cursor: paginationCursor,
      includeRole: z.boolean().optional().default(false),
      projectId: resourceId.optional(),
    }),
    outputSchema: boundedListSchema,
    annotations: readOnly,
  }, async ({ limit = 50, cursor, includeRole = false, projectId }) => {
    const params = new URLSearchParams({ limit: String(limit), includeRole: String(includeRole) });
    if (cursor !== undefined) params.set("cursor", cursor);
    if (projectId !== undefined) params.set("projectId", projectId);
    const res = await n8nFetch(`/users?${params}`);
    if (!res.ok) return handleError(res, "listing users");
    const result = await parseJson(res, listSchema);
    return result ? structuredOk(result) : err("Failed to validate user list response");
  });

  server.registerTool("get_user", {
    description: "Get an n8n user by opaque ID or email address.",
    inputSchema: z.object({
      userIdOrEmail: userIdentifier,
      includeRole: z.boolean().optional().default(false),
    }),
    outputSchema: boundedUserSchema,
    annotations: readOnly,
  }, async ({ userIdOrEmail, includeRole = false }) => {
    const params = new URLSearchParams({ includeRole: String(includeRole) });
    const res = await n8nFetch(`${resourcePath("users", userIdOrEmail)}?${params}`);
    if (!res.ok) return handleError(res, "fetching user");
    const user = await parseJson(res, userSchema);
    return user ? structuredOk(user) : err("Failed to validate user response");
  });
}
