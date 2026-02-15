import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

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
    execSync("claude --version", { stdio: "ignore", timeout: 5_000 });
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
  const envFlags = Object.entries(config.env)
    .map(([k, v]) => `-e ${k}=${v}`)
    .join(" ");

  const cmd = config.command === "tcs-n8n-mcp"
    ? `claude mcp add ${SERVER_KEY} ${envFlags} -- tcs-n8n-mcp`
    : `claude mcp add ${SERVER_KEY} ${envFlags} -- npx -y ${PKG}`;

  try {
    execSync(cmd, { stdio: "ignore", timeout: 10_000 });
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

  if (existsSync(configPath)) {
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

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  return { ok: true, action: hadEntry ? "updated" : "added" };
}

/**
 * Build a copy-paste snippet for manual configuration.
 */
export function manualSnippet(client: ClientInfo, config: McpEntry): string {
  if (client.mode === "cli") {
    const envFlags = Object.entries(config.env)
      .map(([k, v]) => `-e ${k}=${v}`)
      .join(" ");

    return config.command === "tcs-n8n-mcp"
      ? `claude mcp add ${SERVER_KEY} ${envFlags} -- tcs-n8n-mcp`
      : `claude mcp add ${SERVER_KEY} ${envFlags} -- npx -y ${PKG}`;
  }

  const keyLabel = client.jsonKey ?? "mcpServers";
  const json = JSON.stringify(config, null, 4);
  return `Add to your config JSON under "${keyLabel}":\n\n  "${SERVER_KEY}": ${json}`;
}
