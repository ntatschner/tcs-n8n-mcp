import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  createN8nFetch: vi.fn(() => vi.fn()),
  createServer: vi.fn(),
  runSetup: vi.fn(async () => undefined),
  checkConnection: vi.fn(async () => ({ ok: false, error: "offline" })),
}));

vi.mock("./client.js", () => ({ createN8nFetch: mocks.createN8nFetch }));
vi.mock("./config.js", () => ({
  buildAuthHeaders: vi.fn(() => ({ "X-N8N-API-KEY": "key" })),
  checkConnection: mocks.checkConnection,
  parseAuthType: vi.fn(() => "apikey"),
  parseTimeoutMs: vi.fn(() => 30_000),
}));
vi.mock("./server.js", () => ({
  createServer: mocks.createServer,
  SERVER_VERSION: "2.0.0",
}));
vi.mock("./setup.js", () => ({ runSetup: mocks.runSetup }));
vi.mock("@modelcontextprotocol/server/stdio", () => ({
  StdioServerTransport: class StdioServerTransport {},
}));

import { main, runCli } from "./index.js";

describe("main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServer.mockReturnValue({ connect: mocks.connect });
    process.argv = ["node", "index.js"];
    vi.stubEnv("N8N_API_KEY", "key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("connects MCP immediately without gating startup on an n8n probe", async () => {
    await main();
    expect(mocks.checkConnection).not.toHaveBeenCalled();
    expect(mocks.connect).toHaveBeenCalledOnce();
  });

  it("dispatches explicit setup mode without starting the server", async () => {
    process.argv.push("--setup");
    await main();
    expect(mocks.runSetup).toHaveBeenCalledOnce();
    expect(mocks.createServer).not.toHaveBeenCalled();
  });

  it("rejects missing non-interactive credentials", async () => {
    vi.stubEnv("N8N_API_KEY", "");
    await expect(main()).rejects.toThrow("N8N_API_KEY is required");
  });

  it("reports fatal CLI errors without exposing a stack", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.exitCode = 0;
    await runCli(async () => { throw new Error("boom"); });
    expect(error).toHaveBeenCalledWith("Fatal error:", "boom");
    expect(process.exitCode).toBe(1);
    error.mockRestore();
    process.exitCode = 0;
  });
});
