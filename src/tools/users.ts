import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nUser,
} from "../types.js";
import { n8nId, paginationCursor } from "../validation.js";

export function registerUserTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_users ---
  server.tool(
    "list_users",
    "List all n8n users with their roles and status.",
    {
      limit: z.number().int().positive().max(200).optional().default(50).describe("Max results"),
      cursor: paginationCursor,
    },
    async ({ limit, cursor }) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/users?${params}`);
      if (!res.ok) return handleError(res, "listing users");

      const json = await safeJson<N8nPaginatedResponse<N8nUser>>(res);
      if (!json) return err("Failed to parse user list response");

      const users = json.data ?? [];
      const lines = (Array.isArray(users) ? users : []).map(
        (u: N8nUser) => `- ${u.firstName ?? ""} ${u.lastName ?? ""} (ID: ${u.id}, Email: ${u.email}, Role: ${u.role ?? "N/A"})`
      );
      return ok(`Found ${lines.length} users:\n${lines.join("\n")}`);
    }
  );

  // --- get_user ---
  server.tool(
    "get_user",
    "Get full details of an n8n user by ID.",
    {
      userId: n8nId.describe("ID of the user"),
    },
    async ({ userId }) => {
      const res = await n8nFetch(`/users/${userId}`);
      if (!res.ok) return handleError(res, "fetching user");

      const user = await safeJson<Record<string, unknown>>(res);
      if (!user) return err("Failed to parse user response");
      return ok(JSON.stringify(user, null, 2));
    }
  );
}
