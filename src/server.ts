import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import type { FetchFn } from "./types.js";
import { registerWorkflowTools } from "./tools/workflows.js";
import { registerExecutionTools } from "./tools/executions.js";
import { registerTagTools } from "./tools/tags.js";
import { registerVariableTools } from "./tools/variables.js";
import { registerCredentialTools } from "./tools/credentials.js";
import { registerUserTools } from "./tools/users.js";

interface PackageMetadata {
  readonly version: string;
}

function readServerVersion(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const metadata = JSON.parse(raw) as Partial<PackageMetadata>;
  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("package.json does not contain a valid version");
  }
  return metadata.version;
}

export const SERVER_VERSION = readServerVersion();

export function createServer(n8nFetch: FetchFn): McpServer {
  const server = new McpServer({
    name: "tcs-n8n-mcp-server",
    version: SERVER_VERSION,
  });

  registerWorkflowTools(server, n8nFetch);
  registerExecutionTools(server, n8nFetch);
  registerTagTools(server, n8nFetch);
  registerVariableTools(server, n8nFetch);
  registerCredentialTools(server, n8nFetch);
  registerUserTools(server, n8nFetch);

  return server;
}
