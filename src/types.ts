import type { z } from "zod";

export type FetchFn = (path: string, options?: RequestInit) => Promise<Response>;

export const MAX_RESPONSE_CHARS = 25_000;
export const MAX_RESPONSE_BYTES = 2_000_000;

type StructuredContent = Record<string, unknown>;

function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Response could not be serialized" });
  }
}

export function structuredOk(
  value: StructuredContent,
  maxChars = MAX_RESPONSE_CHARS,
) {
  const serialized = jsonText(value);
  if (serialized.length <= maxChars) {
    return {
      content: [{ type: "text" as const, text: serialized }],
      structuredContent: value,
    };
  }

  const metadata: StructuredContent = {
    truncated: true,
    originalCharacters: serialized.length,
    message: "Response exceeded the safe output limit. Use pagination or narrower filters.",
  };
  const metadataText = jsonText(metadata);
  return {
    content: [{ type: "text" as const, text: metadataText.slice(0, maxChars) }],
    structuredContent: metadata,
  };
}

// --- MCP response helpers ---

export function ok(value: unknown, maxChars = MAX_RESPONSE_CHARS) {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return structuredOk(value as StructuredContent, maxChars);
  }
  const text = typeof value === "string" ? value : jsonText(value);
  return { content: [{ type: "text" as const, text: text.slice(0, maxChars) }] };
}

export function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export async function handleError(res: Response, action: string) {
  const status = res.status;
  const statusText = res.statusText || "Unknown error";
  return err(`Error ${action}: HTTP ${status} ${statusText}`);
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string | null> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel("Response body exceeded the configured byte limit");
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function safeJson<T>(
  res: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<T | null> {
  try {
    const text = await readBoundedText(res, maxBytes);
    if (text === null || text.trim().length === 0) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function parseJson<T>(
  res: Response,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const value = await safeJson<unknown>(res);
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// --- n8n API response interfaces ---

export interface N8nPaginatedResponse<T> {
  readonly data: readonly T[];
  readonly nextCursor?: string;
}

export interface N8nWorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

export interface N8nExecutionSummary {
  readonly id: string;
  readonly workflowId: string;
  readonly status: string;
  readonly startedAt?: string;
  readonly stoppedAt?: string;
}

export interface N8nTag {
  readonly id: string;
  readonly name: string;
}

export interface N8nVariable {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

export interface N8nCredential {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly createdAt?: string;
}

export interface N8nUser {
  readonly id: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email: string;
  readonly role?: string;
}

export interface N8nExecutionResult {
  readonly executionId: number;
  readonly waitingForWebhook: boolean;
}
