import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import {
  detectClients,
  buildMcpConfig,
  integrateClient,
  manualSnippet,
} from "./setup.js";
import type { ClientInfo, McpEntry } from "./setup.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExecSync = vi.mocked(execSync);

const sampleEnv: Record<string, string> = {
  N8N_API_URL: "http://localhost:5678",
  N8N_API_KEY: "test-key-123",
};

const sampleConfig: McpEntry = {
  command: "npx",
  args: ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
  env: sampleEnv,
};

const winConfig: McpEntry = {
  command: "tcs-n8n-mcp",
  args: [],
  env: sampleEnv,
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// buildMcpConfig
// ---------------------------------------------------------------------------
describe("buildMcpConfig", () => {
  it("returns npx config for non-Windows platforms", () => {
    const result = buildMcpConfig("darwin", sampleEnv);
    expect(result).toEqual({
      command: "npx",
      args: ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      env: sampleEnv,
    });
  });

  it("returns npx config for linux", () => {
    const result = buildMcpConfig("linux", sampleEnv);
    expect(result.command).toBe("npx");
    expect(result.args).toEqual(["-y", "@thecodesaiyan/tcs-n8n-mcp"]);
  });

  it("returns direct binary config for Windows", () => {
    const result = buildMcpConfig("win32", sampleEnv);
    expect(result).toEqual({
      command: "tcs-n8n-mcp",
      args: [],
      env: sampleEnv,
    });
  });

  it("preserves all env vars", () => {
    const env = { ...sampleEnv, N8N_AUTH_TYPE: "bearer" };
    const result = buildMcpConfig("darwin", env);
    expect(result.env).toEqual(env);
  });
});

// ---------------------------------------------------------------------------
// detectClients
// ---------------------------------------------------------------------------
describe("detectClients", () => {
  it("detects Claude Desktop on darwin when parent dir exists", () => {
    mockExistsSync.mockImplementation((p) => {
      if (typeof p === "string" && p.includes("Claude")) return true;
      return false;
    });
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("darwin");
    const claude = clients.find((c) => c.name === "Claude Desktop");
    expect(claude).toBeDefined();
    expect(claude!.mode).toBe("json");
    expect(claude!.configPath).toContain("claude_desktop_config.json");
  });

  it("detects Cursor when .cursor dir exists", () => {
    mockExistsSync.mockImplementation((p) => {
      if (typeof p === "string" && p.includes(".cursor")) return true;
      return false;
    });
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("darwin");
    const cursor = clients.find((c) => c.name === "Cursor");
    expect(cursor).toBeDefined();
    expect(cursor!.mode).toBe("json");
    expect(cursor!.configPath).toContain("mcp.json");
  });

  it("detects Windsurf when .codeium dir exists", () => {
    mockExistsSync.mockImplementation((p) => {
      if (typeof p === "string" && p.includes(".codeium")) return true;
      return false;
    });
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("linux");
    const windsurf = clients.find((c) => c.name === "Windsurf");
    expect(windsurf).toBeDefined();
    expect(windsurf!.mode).toBe("json");
  });

  it("detects Claude Code when CLI is available", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue(Buffer.from("1.0.0"));

    const clients = detectClients("darwin");
    const claudeCode = clients.find((c) => c.name === "Claude Code");
    expect(claudeCode).toBeDefined();
    expect(claudeCode!.mode).toBe("cli");
  });

  it("skips Claude Code when CLI is not available", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("darwin");
    const claudeCode = clients.find((c) => c.name === "Claude Code");
    expect(claudeCode).toBeUndefined();
  });

  it("always includes VS Code / Cline as manual", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("darwin");
    const vscode = clients.find((c) => c.name === "VS Code / Cline");
    expect(vscode).toBeDefined();
    expect(vscode!.mode).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// integrateClient — JSON mode
// ---------------------------------------------------------------------------
describe("integrateClient (json)", () => {
  const jsonClient: ClientInfo = {
    name: "Claude Desktop",
    mode: "json",
    configPath: "/tmp/test-claude-config.json",
    jsonKey: "mcpServers",
  };

  it("creates config file with new entry when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = integrateClient(jsonClient, sampleConfig);
    expect(result).toEqual({ ok: true, action: "added" });
    expect(mockMkdirSync).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledOnce();

    const written = JSON.parse(
      (mockWriteFileSync.mock.calls[0][1] as string).trim(),
    );
    expect(written.mcpServers["tcs-n8n-mcp"]).toEqual(sampleConfig);
  });

  it("merges into existing config preserving other servers", () => {
    mockExistsSync.mockReturnValue(true);
    const existing = {
      mcpServers: {
        "other-server": { command: "other", args: [], env: {} },
      },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(existing));

    const result = integrateClient(jsonClient, sampleConfig);
    expect(result).toEqual({ ok: true, action: "added" });

    const written = JSON.parse(
      (mockWriteFileSync.mock.calls[0][1] as string).trim(),
    );
    expect(written.mcpServers["other-server"]).toEqual(existing.mcpServers["other-server"]);
    expect(written.mcpServers["tcs-n8n-mcp"]).toEqual(sampleConfig);
  });

  it("reports 'updated' when entry already exists", () => {
    mockExistsSync.mockReturnValue(true);
    const existing = {
      mcpServers: {
        "tcs-n8n-mcp": { command: "old", args: [], env: {} },
      },
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(existing));

    const result = integrateClient(jsonClient, sampleConfig);
    expect(result).toEqual({ ok: true, action: "updated" });
  });

  it("preserves non-mcpServers keys in existing config", () => {
    mockExistsSync.mockReturnValue(true);
    const existing = {
      theme: "dark",
      mcpServers: {},
    };
    mockReadFileSync.mockReturnValue(JSON.stringify(existing));

    integrateClient(jsonClient, sampleConfig);

    const written = JSON.parse(
      (mockWriteFileSync.mock.calls[0][1] as string).trim(),
    );
    expect(written.theme).toBe("dark");
  });

  it("returns error for malformed JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("not valid json {{{");

    const result = integrateClient(jsonClient, sampleConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Malformed JSON");
    }
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("returns error for manual-only client", () => {
    const manualClient: ClientInfo = {
      name: "VS Code",
      mode: "manual",
      jsonKey: "mcpServers",
    };
    const result = integrateClient(manualClient, sampleConfig);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// integrateClient — CLI mode
// ---------------------------------------------------------------------------
describe("integrateClient (cli)", () => {
  const cliClient: ClientInfo = {
    name: "Claude Code",
    mode: "cli",
  };

  it("runs claude mcp add on success (npx command)", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    const result = integrateClient(cliClient, sampleConfig);
    expect(result).toEqual({ ok: true, action: "added" });
    expect(mockExecSync).toHaveBeenCalledOnce();
    const cmd = mockExecSync.mock.calls[0][0] as string;
    expect(cmd).toContain("claude mcp add tcs-n8n-mcp");
    expect(cmd).toContain("npx -y @thecodesaiyan/tcs-n8n-mcp");
  });

  it("runs claude mcp add with tcs-n8n-mcp binary for Windows config", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    const result = integrateClient(cliClient, winConfig);
    expect(result).toEqual({ ok: true, action: "added" });
    const cmd = mockExecSync.mock.calls[0][0] as string;
    expect(cmd).toContain("-- tcs-n8n-mcp");
    expect(cmd).not.toContain("npx");
  });

  it("includes env flags in CLI command", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));

    integrateClient(cliClient, sampleConfig);
    const cmd = mockExecSync.mock.calls[0][0] as string;
    expect(cmd).toContain("-e N8N_API_URL=http://localhost:5678");
    expect(cmd).toContain("-e N8N_API_KEY=test-key-123");
  });

  it("returns error when execSync throws", () => {
    mockExecSync.mockImplementation(() => { throw new Error("command not found"); });

    const result = integrateClient(cliClient, sampleConfig);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("configure manually");
    }
  });
});

// ---------------------------------------------------------------------------
// manualSnippet
// ---------------------------------------------------------------------------
describe("manualSnippet", () => {
  it("returns claude mcp add command for CLI client (npx)", () => {
    const client: ClientInfo = { name: "Claude Code", mode: "cli" };
    const snippet = manualSnippet(client, sampleConfig);
    expect(snippet).toContain("claude mcp add tcs-n8n-mcp");
    expect(snippet).toContain("npx -y @thecodesaiyan/tcs-n8n-mcp");
    expect(snippet).toContain("-e N8N_API_URL=http://localhost:5678");
  });

  it("returns claude mcp add with binary for Windows config", () => {
    const client: ClientInfo = { name: "Claude Code", mode: "cli" };
    const snippet = manualSnippet(client, winConfig);
    expect(snippet).toContain("-- tcs-n8n-mcp");
    expect(snippet).not.toContain("npx");
  });

  it("returns JSON snippet for json-mode client", () => {
    const client: ClientInfo = {
      name: "Claude Desktop",
      mode: "json",
      configPath: "/some/path",
      jsonKey: "mcpServers",
    };
    const snippet = manualSnippet(client, sampleConfig);
    expect(snippet).toContain('"mcpServers"');
    expect(snippet).toContain('"tcs-n8n-mcp"');
    expect(snippet).toContain('"npx"');
  });

  it("returns JSON snippet for manual-mode client", () => {
    const client: ClientInfo = {
      name: "VS Code / Cline",
      mode: "manual",
      jsonKey: "mcpServers",
    };
    const snippet = manualSnippet(client, sampleConfig);
    expect(snippet).toContain('"mcpServers"');
    expect(snippet).toContain('"tcs-n8n-mcp"');
  });
});
