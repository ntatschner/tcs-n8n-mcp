import { z } from "zod";

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

/** Opaque identifier returned by n8n for workflows, tags, variables, and users. */
export const resourceId = z
  .string()
  .min(1, "ID must not be empty")
  .max(512, "ID must not exceed 512 characters")
  .refine((value) => !CONTROL_CHAR_RE.test(value), "ID must not contain control characters")
  .refine((value) => value !== "." && value !== "..", "ID must not be a relative path")
  .describe("Opaque n8n resource ID");

/** Backward-compatible alias retained for tool modules. */
export const n8nId = resourceId;

/** Execution IDs remain decimal numeric strings in the public n8n API. */
export const executionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^\d+$/, "Execution ID must be a numeric string (e.g. '123')")
  .describe("Numeric n8n execution ID");

/** User endpoints accept either an opaque ID or an email address. */
export const userIdentifier = resourceId.describe("Opaque n8n user ID or email address");

/**
 * Schema for pagination cursors.
 * Cursors are opaque strings returned by the n8n API.
 */
export const paginationCursor = z
  .string()
  .min(1, "Cursor must not be empty")
  .max(4096, "Cursor must not exceed 4096 characters")
  .refine((value) => !CONTROL_CHAR_RE.test(value), "Cursor must not contain control characters")
  .optional()
  .describe("Opaque pagination cursor from a previous n8n response");
