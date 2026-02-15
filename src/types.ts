export type FetchFn = (path: string, options?: RequestInit) => Promise<Response>;

// --- MCP response helpers ---

export function ok(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

export function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export async function handleError(res: Response, action: string) {
  const status = res.status;
  const statusText = res.statusText || "Unknown error";
  return err(`Error ${action}: HTTP ${status} ${statusText}`);
}

export async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
