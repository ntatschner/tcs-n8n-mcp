import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import {
  buildAuthHeaders,
  checkConnection,
  parseAuthType,
  readSecret,
  type AuthType,
} from "./config.js";
import { createN8nFetch } from "./client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** MCP server config entry (stdio transport). */
export interface McpEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/** How a client's config can be modified. */
export type IntegrationMode = "json" | "cli" | "manual";

/** Describes a detected MCP client. */
export interface ClientInfo {
  readonly name: string;
  readonly mode: IntegrationMode;
  /** Absolute path to JSON config file (json mode). */
  readonly configPath?: string;
  /** JSON key holding MCP server entries (e.g. "mcpServers"). */
  readonly jsonKey?: string;
}

export type IntegrationResult =
  | { readonly ok: true; readonly action: "added" | "updated" }
  | { readonly ok: false; readonly reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PKG = "@thecodesaiyan/tcs-n8n-mcp";
const SERVER_KEY = "tcs-n8n-mcp";

interface ClientSpec {
  readonly name: string;
  readonly mode: IntegrationMode;
  /** Relative to home dir or absolute template with %APPDATA%. */
  readonly configPaths: ReadonlyArray<{
    readonly platform: "win32" | "darwin" | "linux";
    readonly path: string;
  }>;
  readonly jsonKey?: string;
}

const CLIENT_SPECS: readonly ClientSpec[] = [
  {
    name: "Claude Desktop",
    mode: "json",
    jsonKey: "mcpServers",
    configPaths: [
      { platform: "win32", path: "%APPDATA%/Claude/claude_desktop_config.json" },
      { platform: "darwin", path: "Library/Application Support/Claude/claude_desktop_config.json" },
      { platform: "linux", path: ".config/Claude/claude_desktop_config.json" },
    ],
  },
  {
    name: "Cursor",
    mode: "json",
    jsonKey: "mcpServers",
    configPaths: [
      { platform: "win32", path: ".cursor/mcp.json" },
      { platform: "darwin", path: ".cursor/mcp.json" },
      { platform: "linux", path: ".cursor/mcp.json" },
    ],
  },
  {
    name: "Windsurf",
    mode: "json",
    jsonKey: "mcpServers",
    configPaths: [
      { platform: "win32", path: ".codeium/windsurf/mcp_config.json" },
      { platform: "darwin", path: ".codeium/windsurf/mcp_config.json" },
      { platform: "linux", path: ".codeium/windsurf/mcp_config.json" },
    ],
  },
  {
    name: "Claude Code",
    mode: "cli",
    configPaths: [],
  },
  {
    name: "VS Code / Cline",
    mode: "manual",
    jsonKey: "mcpServers",
    configPaths: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveConfigPath(template: string, platform: string): string {
  if (platform === "win32" && template.startsWith("%APPDATA%")) {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return template.replace("%APPDATA%", appData).replace(/\//g, "\\");
  }
  // Relative to home dir
  return join(homedir(), ...template.split("/"));
}

function claudeCodeAvailable(): boolean {
  try {
    execFileSync("claude", ["--version"], {
      shell: false,
      stdio: "ignore",
      timeout: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan for installed MCP client config dirs / CLIs.
 * Returns only clients that are detected on the current system.
 */
export function detectClients(platform: string = process.platform): readonly ClientInfo[] {
  const detected: ClientInfo[] = [];

  for (const spec of CLIENT_SPECS) {
    if (spec.mode === "json") {
      const match = spec.configPaths.find((p) => p.platform === platform);
      if (!match) continue;
      const configPath = resolveConfigPath(match.path, platform);
      // Detect by parent directory existing (config file may not exist yet)
      const parentDir = dirname(configPath);
      if (existsSync(parentDir) || existsSync(configPath)) {
        detected.push({
          name: spec.name,
          mode: "json",
          configPath,
          jsonKey: spec.jsonKey,
        });
      }
    } else if (spec.mode === "cli") {
      if (claudeCodeAvailable()) {
        detected.push({ name: spec.name, mode: "cli" });
      }
    } else {
      // Manual-only clients are always listed
      detected.push({ name: spec.name, mode: "manual", jsonKey: spec.jsonKey });
    }
  }

  return detected;
}

/**
 * Build the MCP config entry for the stdio transport.
 */
export function buildMcpConfig(
  platform: string,
  env: Readonly<Record<string, string>>,
): McpEntry {
  if (platform === "win32") {
    return { command: "tcs-n8n-mcp", args: [], env };
  }
  return { command: "npx", args: ["-y", PKG], env };
}

/**
 * Write/merge the MCP entry into a client's JSON config file.
 */
export function integrateClient(client: ClientInfo, config: McpEntry): IntegrationResult {
  if (client.mode === "cli") {
    return integrateCli(config);
  }

  if (client.mode !== "json" || !client.configPath || !client.jsonKey) {
    return { ok: false, reason: "Client does not support auto-integration" };
  }

  return integrateJson(client.configPath, client.jsonKey, config);
}

function integrateCli(config: McpEntry): IntegrationResult {
  const envArgs = Object.entries(config.env)
    .flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  const args = [
    "mcp",
    "add",
    SERVER_KEY,
    ...envArgs,
    "--",
    config.command,
    ...config.args,
  ];

  try {
    execFileSync("claude", args, {
      shell: false,
      stdio: "ignore",
      timeout: 10_000,
    });
    return { ok: true, action: "added" };
  } catch {
    return { ok: false, reason: "claude mcp add failed — configure manually" };
  }
}

function integrateJson(
  configPath: string,
  jsonKey: string,
  config: McpEntry,
): IntegrationResult {
  let existing: Record<string, unknown> = {};
  let hadEntry = false;
  const configExists = existsSync(configPath);

  if (configExists) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: `Malformed JSON in ${configPath} — fix manually` };
    }

    const servers = existing[jsonKey] as Record<string, unknown> | undefined;
    hadEntry = servers !== undefined && SERVER_KEY in (servers ?? {});
  }

  // Immutable merge
  const existingServers = (existing[jsonKey] ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...existing,
    [jsonKey]: {
      ...existingServers,
      [SERVER_KEY]: config,
    },
  };

  // Create parent dirs if needed
  const parentDir = dirname(configPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  writeSecureJson(configPath, JSON.stringify(merged, null, 2) + "\n");

  return { ok: true, action: hadEntry ? "updated" : "added" };
}

/** Atomically replace a client config, using owner-only permissions on POSIX. */
export function writeSecureJson(
  configPath: string,
  content: string,
  platform: string = process.platform,
): void {
  const tempPath = join(
    dirname(configPath),
    `.${basename(configPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(tempPath, content, { encoding: "utf-8", mode: 0o600, flag: "wx" });
    renameSync(tempPath, configPath);
    if (platform !== "win32") chmodSync(configPath, 0o600);
  } catch (error) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw error;
  }
}

/**
 * Build a copy-paste snippet for manual configuration.
 */
export function manualSnippet(
  client: ClientInfo,
  config: McpEntry,
  platform: string = process.platform,
): string {
  const displayConfig: McpEntry = {
    ...config,
    env: {
      ...config.env,
      ...(config.env.N8N_API_KEY === undefined
        ? {}
        : { N8N_API_KEY: "<set-in-client-config>" }),
    },
  };
  if (client.mode === "cli") {
    const quote = platform === "win32" ? quotePowerShell : quotePosixShell;
    const args = [
      "mcp",
      "add",
      SERVER_KEY,
      ...Object.entries(displayConfig.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
      "--",
      displayConfig.command,
      ...displayConfig.args,
    ];
    return ["claude", ...args.map(quote)].join(" ");
  }

  const keyLabel = client.jsonKey ?? "mcpServers";
  const json = JSON.stringify(displayConfig, null, 4);
  return `Add to your config JSON under "${keyLabel}":\n\n  "${SERVER_KEY}": ${json}`;
}

/** Run the interactive setup wizard used by the CLI entry point. */
export async function runSetup(): Promise<void> {
  const initialPrompt = createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n  @thecodesaiyan/tcs-n8n-mcp - Setup Wizard\n");

  let url: string;
  let authType: AuthType;
  let apiUser = "";
  try {
    url = (await initialPrompt.question("  n8n URL [http://localhost:5678]: ")).trim()
      || "http://localhost:5678";
    const authTypeRaw = (
      await initialPrompt.question("  Auth type (apikey/bearer/basic) [apikey]: ")
    ).trim() || "apikey";
    authType = parseAuthType(authTypeRaw);

    if (authType === "basic") {
      apiUser = (await initialPrompt.question("  n8n Username: ")).trim();
      if (!apiUser) throw new Error("Username is required for basic auth");
    }
  } finally {
    initialPrompt.close();
  }

  const credentialLabel = authType === "basic" ? "Password" : "API Key";
  const apiKey = (await readSecret(`  n8n ${credentialLabel}: `)).trim();
  if (!apiKey) {
    throw new Error(
      authType === "basic"
        ? "Password is required"
        : "API key is required. Generate one in n8n: Settings > API > Create API Key",
    );
  }

  console.log("\n  Testing connection...");
  const authHeaders = buildAuthHeaders(authType, apiKey, apiUser || undefined);
  const connection = await checkConnection(createN8nFetch({
    baseUrl: url,
    authHeaders,
    timeoutMs: 10_000,
  }));
  if (!connection.ok) throw new Error(`Connection failed: ${connection.error}`);
  console.log("  Connected successfully!\n");

  const env: Record<string, string> = { N8N_API_URL: url, N8N_API_KEY: apiKey };
  if (authType !== "apikey") env.N8N_AUTH_TYPE = authType;
  if (authType === "basic") env.N8N_API_USER = apiUser;

  const config = buildMcpConfig(process.platform, env);
  if (process.platform === "win32") {
    console.log("  -- Prerequisite (Windows) --");
    console.log("  npm install -g @thecodesaiyan/tcs-n8n-mcp\n");
  }

  const clients = detectClients();
  if (clients.length === 0) {
    console.log("  No MCP clients detected. Manual config snippets:\n");
    printManualSnippets(config);
    return;
  }

  console.log("  Detected MCP clients:\n");
  clients.forEach((client, index) => {
    const modeLabel = client.mode === "json" ? "auto" : client.mode === "cli" ? "CLI" : "manual";
    console.log(`    ${index + 1}. ${client.name} (${modeLabel})`);
  });
  console.log();

  const selectionPrompt = createInterface({ input: process.stdin, output: process.stdout });
  let answer: string;
  try {
    answer = (
      await selectionPrompt.question("  Configure which? (1,2,... or 'all' or 'none') [all]: ")
    ).trim().toLowerCase() || "all";
  } finally {
    selectionPrompt.close();
  }

  if (answer === "none") {
    console.log("\n  Skipped. Manual config snippets:\n");
    printManualSnippets(config);
    return;
  }

  const selected = selectClients(clients, answer);
  if (selected.length === 0) {
    console.log("\n  No valid selection. Manual config snippets:\n");
    printManualSnippets(config);
    return;
  }

  console.log();
  for (const client of selected) {
    if (client.mode === "manual") {
      console.log(`  -- ${client.name} (manual) --`);
      console.log(`  ${manualSnippet(client, config)}\n`);
      continue;
    }

    const result = integrateClient(client, config);
    if (result.ok) {
      console.log(`  OK ${client.name}: ${result.action}`);
    } else {
      console.log(`  ERROR ${client.name}: ${result.reason}`);
      console.log("    Manual fallback:");
      console.log(`    ${manualSnippet(client, config)}\n`);
    }
  }

  console.log("\n  Installed config entries contain credentials; displayed snippets use a placeholder.");
  console.log("  Keep client configuration files private.\n");
}

function selectClients(
  clients: readonly ClientInfo[],
  answer: string,
): readonly ClientInfo[] {
  if (answer === "all") return clients;
  const indices = answer
    .split(/[,\s]+/)
    .map((value) => Number.parseInt(value, 10) - 1)
    .filter((index) => index >= 0 && index < clients.length);
  return indices.map((index) => clients[index]);
}

function printManualSnippets(config: McpEntry): void {
  const jsonClient: ClientInfo = { name: "JSON clients", mode: "manual", jsonKey: "mcpServers" };
  const cliClient: ClientInfo = { name: "Claude Code", mode: "cli" };
  console.log("  -- Claude Desktop / Windsurf / Cursor --");
  console.log(`  ${manualSnippet(jsonClient, config)}\n`);
  console.log("  -- Claude Code --");
  console.log(`  ${manualSnippet(cliClient, config)}\n`);
}

function quotePosixShell(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quotePowerShell(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "''")}'`;
}
