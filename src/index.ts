#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createN8nFetch } from "./client.js";
import {
  buildAuthHeaders,
  parseAuthType,
  parseTimeoutMs,
} from "./config.js";
import { createServer, SERVER_VERSION } from "./server.js";
import { runSetup } from "./setup.js";

export async function main(): Promise<void> {
  if (process.argv.includes("--setup") || (!process.env.N8N_API_KEY && process.stdin.isTTY)) {
    await runSetup();
    return;
  }

  const apiKey = process.env.N8N_API_KEY ?? "";
  if (!apiKey) {
    throw new Error(
      "N8N_API_KEY is required. Run `npx @thecodesaiyan/tcs-n8n-mcp --setup` for interactive configuration.",
    );
  }

  const authType = parseAuthType(process.env.N8N_AUTH_TYPE);
  const n8nFetch = createN8nFetch({
    baseUrl: process.env.N8N_API_URL ?? "http://localhost:5678",
    authHeaders: buildAuthHeaders(authType, apiKey, process.env.N8N_API_USER),
    timeoutMs: parseTimeoutMs(process.env.N8N_TIMEOUT_MS),
  });

  const server = createServer(n8nFetch);
  await server.connect(new StdioServerTransport());
  console.error(`@thecodesaiyan/tcs-n8n-mcp v${SERVER_VERSION} running on stdio`);
}

export async function runCli(run: () => Promise<void> = main): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    console.error("Fatal error:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli();
}
