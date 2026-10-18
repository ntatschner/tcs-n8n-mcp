import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { checkConnection, readSecret } from "./config.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import {
  detectClients,
  buildMcpConfig,
  integrateClient,
  manualSnippet,
  runSetup,
  writeSecureJson,
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
    chmodSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

vi.mock("node:readline/promises", () => ({ createInterface: vi.fn() }));

vi.mock("./config.js", async () => {
  const actual = await vi.importActual<typeof import("./config.js")>("./config.js");
  return {
    ...actual,
    checkConnection: vi.fn(),
    readSecret: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockChmodSync = vi.mocked(chmodSync);
const mockRenameSync = vi.mocked(renameSync);
const mockExecFileSync = vi.mocked(execFileSync);
const mockCreateInterface = vi.mocked(createInterface);
const mockCheckConnection = vi.mocked(checkConnection);
const mockReadSecret = vi.mocked(readSecret);

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
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });

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
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });

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
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("linux");
    const windsurf = clients.find((c) => c.name === "Windsurf");
    expect(windsurf).toBeDefined();
    expect(windsurf!.mode).toBe("json");
  });

  it("detects Claude Code when CLI is available", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockReturnValue(Buffer.from("1.0.0"));

    const clients = detectClients("darwin");
    const claudeCode = clients.find((c) => c.name === "Claude Code");
    expect(claudeCode).toBeDefined();
    expect(claudeCode!.mode).toBe("cli");
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "claude",
      ["--version"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("skips Claude Code when CLI is not available", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });

    const clients = detectClients("darwin");
    const claudeCode = clients.find((c) => c.name === "Claude Code");
    expect(claudeCode).toBeUndefined();
  });

  it("always includes VS Code / Cline as manual", () => {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });

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
    expect(mockWriteFileSync.mock.calls[0][2]).toEqual({
      encoding: "utf-8", mode: 0o600, flag: "wx",
    });

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
    expect(mockWriteFileSync.mock.calls[0][2]).toEqual({
      encoding: "utf-8", mode: 0o600, flag: "wx",
    });
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

describe("writeSecureJson", () => {
  it("atomically replaces POSIX config files with mode 0600", () => {
    writeSecureJson("/tmp/client/config.json", "{}\n", "linux");
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\.config\.json\..+\.tmp$/),
      "{}\n",
      expect.objectContaining({ encoding: "utf-8", mode: 0o600, flag: "wx" }),
    );
    const tempPath = String(mockWriteFileSync.mock.calls[0][0]);
    expect(mockRenameSync).toHaveBeenCalledWith(tempPath, "/tmp/client/config.json");
    expect(mockChmodSync).toHaveBeenCalledWith("/tmp/client/config.json", 0o600);
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
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const result = integrateClient(cliClient, sampleConfig);
    expect(result).toEqual({ ok: true, action: "added" });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "claude",
      [
        "mcp", "add", "tcs-n8n-mcp",
        "-e", "N8N_API_URL=http://localhost:5678",
        "-e", "N8N_API_KEY=test-key-123",
        "--", "npx", "-y", "@thecodesaiyan/tcs-n8n-mcp",
      ],
      expect.objectContaining({ shell: false }),
    );
  });

  it("runs claude mcp add with tcs-n8n-mcp binary for Windows config", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    const result = integrateClient(cliClient, winConfig);
    expect(result).toEqual({ ok: true, action: "added" });
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args.slice(-2)).toEqual(["--", "tcs-n8n-mcp"]);
    expect(args).not.toContain("npx");
  });

  it("passes hostile environment values as single literal arguments", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    integrateClient(cliClient, {
      ...sampleConfig,
      env: { ...sampleEnv, N8N_API_KEY: "key; echo pwned && $(whoami)" },
    });
    const args = mockExecFileSync.mock.calls[0][1] as string[];
    expect(args).toContain("N8N_API_KEY=key; echo pwned && $(whoami)");
    expect(mockExecFileSync.mock.calls[0][2]).toEqual(
      expect.objectContaining({ shell: false }),
    );
  });

  it("returns error when execFileSync throws", () => {
    mockExecFileSync.mockImplementation(() => { throw new Error("command not found"); });

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
    expect(snippet).toContain("set-in-client-config");
    expect(snippet).not.toContain("test-key-123");
  });

  it("quotes hostile values for a POSIX shell", () => {
    const client: ClientInfo = { name: "Claude Code", mode: "cli" };
    const snippet = manualSnippet(client, {
      ...sampleConfig,
      env: { N8N_API_KEY: "key'; echo pwned; '" },
    }, "linux");
    expect(snippet).not.toContain("pwned");
    expect(snippet).toContain("set-in-client-config");
  });

  it("quotes hostile values for PowerShell", () => {
    const client: ClientInfo = { name: "Claude Code", mode: "cli" };
    const snippet = manualSnippet(client, {
      ...winConfig,
      env: { N8N_API_KEY: "key'; Write-Host pwned; '" },
    }, "win32");
    expect(snippet).not.toContain("pwned");
    expect(snippet).toContain("set-in-client-config");
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

describe("runSetup", () => {
  it("reads credentials without readline echo and prints a truthful manual warning", async () => {
    const question = vi.fn(async (prompt: string) => {
      if (prompt.includes("n8n URL")) return "http://localhost:5678";
      if (prompt.includes("Auth type")) return "apikey";
      return "none";
    });
    const close = vi.fn();
    mockCreateInterface.mockReturnValue({ question, close } as never);
    mockReadSecret.mockResolvedValue("secret; $(not-executed)");
    mockCheckConnection.mockResolvedValue({ ok: true });
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runSetup();

    expect(mockReadSecret).toHaveBeenCalledWith("  n8n API Key: ");
    expect(question).not.toHaveBeenCalledWith(expect.stringContaining("API Key"));
    expect(log.mock.calls.flat().join("\n")).toContain("Manual config snippets");
    expect(log.mock.calls.flat().join("\n")).toContain("set-in-client-config");
    expect(log.mock.calls.flat().join("\n")).not.toContain("secret; $(not-executed)");
    log.mockRestore();
  });

  it("automatically writes a detected JSON client config", async () => {
    const question = vi.fn(async (prompt: string) => {
      if (prompt.includes("n8n URL")) return "https://n8n.example.test/api/v1";
      if (prompt.includes("Auth type")) return "bearer";
      return "all";
    });
    mockCreateInterface.mockReturnValue({ question, close: vi.fn() } as never);
    mockReadSecret.mockResolvedValue("token");
    mockCheckConnection.mockResolvedValue({ ok: true });
    mockExistsSync.mockImplementation((path) => String(path).includes("Claude"));
    mockReadFileSync.mockReturnValue(JSON.stringify({ mcpServers: {} }));
    mockExecFileSync.mockImplementation(() => { throw new Error("not found"); });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runSetup();

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]));
    expect(written.mcpServers["tcs-n8n-mcp"].env).toMatchObject({
      N8N_API_URL: "https://n8n.example.test/api/v1",
      N8N_API_KEY: "token",
      N8N_AUTH_TYPE: "bearer",
    });
    log.mockRestore();
  });
});
