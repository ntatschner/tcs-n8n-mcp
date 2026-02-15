import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FetchFn } from "../types.js";
import {
  ok, err, handleError, safeJson,
  type N8nPaginatedResponse, type N8nTag,
} from "../types.js";
import { n8nId, paginationCursor } from "../validation.js";

export function registerTagTools(server: McpServer, n8nFetch: FetchFn) {
  // --- list_tags ---
  server.tool(
    "list_tags",
    "List all n8n tags used for organizing workflows.",
    {
      limit: z.number().int().positive().max(200).optional().default(50).describe("Max results"),
      cursor: paginationCursor,
    },
    async ({ limit, cursor }) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      if (cursor) params.set("cursor", cursor);

      const res = await n8nFetch(`/tags?${params}`);
      if (!res.ok) return handleError(res, "listing tags");

      const json = await safeJson<N8nPaginatedResponse<N8nTag>>(res);
      if (!json) return err("Failed to parse tag list response");

      const tags = json.data ?? [];
      const lines = (Array.isArray(tags) ? tags : []).map(
        (t: N8nTag) => `- ${t.name} (ID: ${t.id})`
      );
      return ok(`Found ${lines.length} tags:\n${lines.join("\n")}`);
    }
  );

  // --- create_tag ---
  server.tool(
    "create_tag",
    "Create a new tag for organizing n8n workflows.",
    { name: z.string().describe("Tag name") },
    async ({ name }) => {
      const res = await n8nFetch("/tags", { method: "POST", body: JSON.stringify({ name }) });
      if (!res.ok) return handleError(res, "creating tag");

      const tag = await safeJson<N8nTag>(res);
      if (!tag) return err("Failed to parse create tag response");
      return ok(`Created tag "${tag.name}" (ID: ${tag.id})`);
    }
  );

  // --- update_tag ---
  server.tool(
    "update_tag",
    "Rename an existing n8n tag.",
    {
      tagId: n8nId.describe("ID of the tag to update"),
      name: z.string().describe("New tag name"),
    },
    async ({ tagId, name }) => {
      const res = await n8nFetch(`/tags/${tagId}`, { method: "PUT", body: JSON.stringify({ name }) });
      if (!res.ok) return handleError(res, "updating tag");

      const tag = await safeJson<N8nTag>(res);
      if (!tag) return err("Failed to parse update tag response");
      return ok(`Updated tag to "${tag.name}" (ID: ${tag.id})`);
    }
  );

  // --- delete_tag ---
  server.tool(
    "delete_tag",
    "Delete an n8n tag by ID.",
    { tagId: n8nId.describe("ID of the tag to delete") },
    async ({ tagId }) => {
      const res = await n8nFetch(`/tags/${tagId}`, { method: "DELETE" });
      if (!res.ok) return handleError(res, "deleting tag");
      return ok(`Deleted tag ${tagId}`);
    }
  );
}
