#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { FetchFn } from "./types.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerExecutionTools } from "./tools/executions.js";
import { registerTagTools } from "./tools/tags.js";
import { registerVariableTools } from "./tools/variables.js";
import { registerCredentialTools } from "./tools/credentials.js";
import { registerUserTools } from "./tools/users.js";

const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY || "";

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY environment variable is required");
  process.exit(1);
}

const apiBase = `${N8N_API_URL.replace(/\/$/, "")}/api/v1`;
const DEFAULT_TIMEOUT_MS = 30_000;

const n8nFetch: FetchFn = (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  return fetch(`${apiBase}${path}`, {
    ...options,
    signal: options.signal ?? controller.signal,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      ...options.headers,
    },
  }).finally(() => clearTimeout(timeoutId));
};

const server = new McpServer({
  name: "tcs-n8n-mcp",
  version: "1.0.1",
});

// Register all tool modules
registerWorkflowTools(server, n8nFetch);
registerExecutionTools(server, n8nFetch);
registerTagTools(server, n8nFetch);
registerVariableTools(server, n8nFetch);
registerCredentialTools(server, n8nFetch);
registerUserTools(server, n8nFetch);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("tcs-n8n-mcp v1.0.1 running on stdio (22 tools)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
