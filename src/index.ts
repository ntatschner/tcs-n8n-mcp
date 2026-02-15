#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createInterface } from "node:readline/promises";
import type { FetchFn } from "./types.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerExecutionTools } from "./tools/executions.js";
import { registerTagTools } from "./tools/tags.js";
import { registerVariableTools } from "./tools/variables.js";
import { registerCredentialTools } from "./tools/credentials.js";
import { registerUserTools } from "./tools/users.js";

// --- Interactive setup mode ---
if (process.argv.includes("--setup")) {
  runSetup().then(() => process.exit(0)).catch((e) => {
    console.error("Setup failed:", e);
    process.exit(1);
  });
}

async function runSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  @thecodesaiyan/tcs-n8n-mcp - Setup Wizard\n");

  const url = (await rl.question("  n8n URL [http://localhost:5678]: ")).trim() || "http://localhost:5678";
  const apiKey = (await rl.question("  n8n API Key: ")).trim();
  rl.close();

  if (!apiKey) {
    console.error("\n  API key is required. Generate one in n8n: Settings > API > Create API Key\n");
    process.exit(1);
  }

  // Test connection
  console.log("\n  Testing connection...");
  const testUrl = `${url.replace(/\/$/, "")}/api/v1/workflows?limit=1`;
  try {
    const res = await fetch(testUrl, {
      headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`  Connection failed: HTTP ${res.status}`);
      console.error("  Check your URL and API key, then try again.\n");
      process.exit(1);
    }
    console.log("  Connected successfully!\n");
  } catch (e) {
    console.error(`  Connection failed: ${e instanceof Error ? e.message : e}`);
    console.error("  Check your URL and API key, then try again.\n");
    process.exit(1);
  }

  const pkg = "@thecodesaiyan/tcs-n8n-mcp";
  const envJson = JSON.stringify({ N8N_API_URL: url, N8N_API_KEY: apiKey });
  const stdioCfg = {
    command: "npx",
    args: ["-y", pkg],
    env: { N8N_API_URL: url, N8N_API_KEY: apiKey },
  };

  console.log("  ── Claude Code ──");
  console.log(`  claude mcp add tcs-n8n-mcp -e N8N_API_URL=${url} -e N8N_API_KEY=${apiKey} -- npx -y ${pkg}\n`);

  console.log("  ── Claude Desktop / Windsurf ──");
  console.log("  Add to your config JSON under \"mcpServers\":\n");
  console.log(`  "tcs-n8n-mcp": ${JSON.stringify(stdioCfg, null, 4)}\n`);

  console.log("  ── Cursor ──");
  console.log("  Add to .cursor/mcp.json under \"mcpServers\":\n");
  console.log(`  "tcs-n8n-mcp": ${JSON.stringify(stdioCfg, null, 4)}\n`);
}

// --- Normal MCP server mode ---
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
  name: "@thecodesaiyan/tcs-n8n-mcp",
  version: "1.1.0",
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
  console.error("@thecodesaiyan/tcs-n8n-mcp v1.1.0 running on stdio (22 tools)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
