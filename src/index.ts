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
import { parseAuthType, buildAuthHeaders, parseTimeoutMs, checkConnection } from "./config.js";
import type { AuthType } from "./config.js";
import { detectClients, buildMcpConfig, integrateClient, manualSnippet } from "./setup.js";
import type { ClientInfo } from "./setup.js";

// --- Interactive setup: --setup flag OR missing config in a TTY ---
if (process.argv.includes("--setup") || (!process.env.N8N_API_KEY && process.stdin.isTTY)) {
  await runSetup().catch((e) => {
    console.error("Setup failed:", e);
    process.exit(1);
  });
  process.exit(0);
}

async function runSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  @thecodesaiyan/tcs-n8n-mcp - Setup Wizard\n");

  const url = (await rl.question("  n8n URL [http://localhost:5678]: ")).trim() || "http://localhost:5678";

  const authTypeRaw = (await rl.question("  Auth type (apikey/bearer/basic) [apikey]: ")).trim() || "apikey";
  let authType: AuthType;
  try {
    authType = parseAuthType(authTypeRaw);
  } catch {
    console.error(`\n  Invalid auth type "${authTypeRaw}". Must be: apikey, bearer, or basic.\n`);
    rl.close();
    process.exit(1);
  }

  let apiUser = "";
  if (authType === "basic") {
    apiUser = (await rl.question("  n8n Username: ")).trim();
    if (!apiUser) {
      console.error("\n  Username is required for basic auth.\n");
      rl.close();
      process.exit(1);
    }
  }

  const credentialLabel = authType === "basic" ? "Password" : "API Key";
  const apiKey = (await rl.question(`  n8n ${credentialLabel}: `)).trim();

  if (!apiKey) {
    console.error(
      authType === "basic"
        ? "\n  Password is required.\n"
        : "\n  API key is required. Generate one in n8n: Settings > API > Create API Key\n",
    );
    rl.close();
    process.exit(1);
  }

  // Test connection
  console.log("\n  Testing connection...");
  const testUrl = `${url.replace(/\/$/, "")}/api/v1/workflows?limit=1`;
  const testHeaders = buildAuthHeaders(authType, apiKey, apiUser || undefined);
  try {
    const res = await fetch(testUrl, {
      headers: { ...testHeaders, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`  Connection failed: HTTP ${res.status}`);
      console.error("  Check your URL and credentials, then try again.\n");
      process.exit(1);
    }
    console.log("  Connected successfully!\n");
  } catch (e) {
    console.error(`  Connection failed: ${e instanceof Error ? e.message : e}`);
    console.error("  Check your URL and credentials, then try again.\n");
    process.exit(1);
  }

  // Build env config — only include non-default values
  const env: Record<string, string> = {
    N8N_API_URL: url,
    N8N_API_KEY: apiKey,
  };
  if (authType !== "apikey") {
    env.N8N_AUTH_TYPE = authType;
  }
  if (authType === "basic") {
    env.N8N_API_USER = apiUser;
  }

  const isWindows = process.platform === "win32";
  const mcpConfig = buildMcpConfig(process.platform, env);

  if (isWindows) {
    console.log("  ── Prerequisites (Windows) ──");
    console.log("  npm install -g @thecodesaiyan/tcs-n8n-mcp\n");
  }

  // Detect installed clients
  const clients = detectClients();

  if (clients.length === 0) {
    console.log("  No MCP clients detected. Manual config snippets:\n");
    printManualSnippets(mcpConfig);
    rl.close();
    return;
  }

  // Display detected clients
  console.log("  Detected MCP clients:\n");
  clients.forEach((c, i) => {
    const modeLabel = c.mode === "json" ? "auto" : c.mode === "cli" ? "CLI" : "manual";
    console.log(`    ${i + 1}. ${c.name} (${modeLabel})`);
  });
  console.log();

  const answer = (
    await rl.question("  Configure which? (1,2,... or 'all' or 'none') [all]: ")
  ).trim().toLowerCase() || "all";

  if (answer === "none") {
    console.log("\n  Skipped. Manual config snippets:\n");
    printManualSnippets(mcpConfig);
    rl.close();
    return;
  }

  const selected = selectClients(clients, answer);

  if (selected.length === 0) {
    console.log("\n  No valid selection. Manual config snippets:\n");
    printManualSnippets(mcpConfig);
    rl.close();
    return;
  }

  console.log();
  for (const client of selected) {
    if (client.mode === "manual") {
      console.log(`  ── ${client.name} (manual) ──`);
      console.log(`  ${manualSnippet(client, mcpConfig)}\n`);
      continue;
    }

    const result = integrateClient(client, mcpConfig);
    if (result.ok) {
      console.log(`  ✓ ${client.name}: ${result.action}`);
    } else {
      console.log(`  ✗ ${client.name}: ${result.reason}`);
      console.log(`    Manual fallback:`);
      console.log(`    ${manualSnippet(client, mcpConfig)}\n`);
    }
  }

  console.log("\n  Note: Config entries contain your credentials.");
  console.log("  Avoid sharing them in public channels or screenshots.\n");

  rl.close();
}

function selectClients(
  clients: readonly ClientInfo[],
  answer: string,
): readonly ClientInfo[] {
  if (answer === "all") return clients;

  const indices = answer
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10) - 1)
    .filter((i) => i >= 0 && i < clients.length);

  return indices.map((i) => clients[i]);
}

function printManualSnippets(config: ReturnType<typeof buildMcpConfig>): void {
  const stdioCfg = JSON.stringify(config, null, 4);
  console.log("  ── Claude Desktop / Windsurf / Cursor ──");
  console.log(`  Add to config JSON under "mcpServers":\n`);
  console.log(`  "tcs-n8n-mcp": ${stdioCfg}\n`);

  const envFlags = Object.entries(config.env)
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(" ");
  const cmd = config.command === "tcs-n8n-mcp"
    ? `claude mcp add tcs-n8n-mcp ${envFlags} -- tcs-n8n-mcp`
    : `claude mcp add tcs-n8n-mcp ${envFlags} -- npx -y @thecodesaiyan/tcs-n8n-mcp`;
  console.log("  ── Claude Code ──");
  console.log(`  ${cmd}\n`);
}

// --- Normal MCP server mode ---
const N8N_API_URL = process.env.N8N_API_URL || "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY || "";
const N8N_API_USER = process.env.N8N_API_USER || "";

if (!N8N_API_KEY) {
  console.error("N8N_API_KEY environment variable is required.");
  console.error("Tip: run `npx @thecodesaiyan/tcs-n8n-mcp --setup` for interactive configuration.");
  process.exit(1);
}

let authType: AuthType;
try {
  authType = parseAuthType(process.env.N8N_AUTH_TYPE);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

if (authType === "basic" && !N8N_API_USER) {
  console.error("N8N_API_USER environment variable is required when N8N_AUTH_TYPE is 'basic'");
  process.exit(1);
}

const authHeaders = buildAuthHeaders(authType, N8N_API_KEY, N8N_API_USER || undefined);
const apiBase = `${N8N_API_URL.replace(/\/$/, "")}/api/v1`;
const DEFAULT_TIMEOUT_MS = parseTimeoutMs(process.env.N8N_TIMEOUT_MS);

const n8nFetch: FetchFn = (path, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  return fetch(`${apiBase}${path}`, {
    ...options,
    signal: options.signal ?? controller.signal,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...options.headers,
    },
  }).finally(() => clearTimeout(timeoutId));
};

const server = new McpServer({
  name: "@thecodesaiyan/tcs-n8n-mcp",
  version: "1.4.0",
});

// Register all tool modules
registerWorkflowTools(server, n8nFetch);
registerExecutionTools(server, n8nFetch);
registerTagTools(server, n8nFetch);
registerVariableTools(server, n8nFetch);
registerCredentialTools(server, n8nFetch);
registerUserTools(server, n8nFetch);

async function main() {
  const result = await checkConnection(n8nFetch);
  if (!result.ok) {
    console.error(`n8n connection check failed: ${result.error}`);
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("@thecodesaiyan/tcs-n8n-mcp v1.4.0 running on stdio (22 tools)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
