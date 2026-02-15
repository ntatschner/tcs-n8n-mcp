import { z } from "zod";

/**
 * Schema for n8n resource IDs.
 * n8n uses numeric IDs (integers as strings) for all resources.
 * Prevents path traversal attacks (e.g. "../admin").
 */
export const n8nId = z
  .string()
  .regex(/^\d+$/, "ID must be a numeric string (e.g. '123')")
  .describe("Numeric resource ID");

/**
 * Schema for pagination cursors.
 * Cursors are alphanumeric base64-like strings from the n8n API.
 */
export const paginationCursor = z
  .string()
  .regex(/^[a-zA-Z0-9+/=_-]+$/, "Invalid cursor format")
  .optional()
  .describe("Pagination cursor from previous response");
