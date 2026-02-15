import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nCredential,
} from "../types.js";
import { paginationCursor } from "../validation.js";

export function registerCredentialTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_credentials ---
  server.tool(
    "list_credentials",
    "List all n8n credentials (metadata only — secrets are not exposed). Shows name, type, and creation date.",
    {
      limit: z.number().int().positive().max(200).optional().default(50).describe("Max results"),
      cursor: paginationCursor,
    },
    async ({ limit, cursor }) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/credentials?${params}`);
      if (!res.ok) return handleError(res, "listing credentials");

      const json = await safeJson<N8nPaginatedResponse<N8nCredential>>(res);
      if (!json) return err("Failed to parse credential list response");

      const creds = json.data ?? [];
      const lines = (Array.isArray(creds) ? creds : []).map(
        (c: N8nCredential) => `- ${c.name} (ID: ${c.id}, Type: ${c.type}, Created: ${c.createdAt ?? "N/A"})`
      );
      return ok(`Found ${lines.length} credentials:\n${lines.join("\n")}`);
    }
  );
}
