import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

const registrations = vi.hoisted(() => ({
  workflows: vi.fn(),
  executions: vi.fn(),
  tags: vi.fn(),
  variables: vi.fn(),
  credentials: vi.fn(),
  users: vi.fn(),
}));

vi.mock("./tools/workflows.js", () => ({ registerWorkflowTools: registrations.workflows }));
vi.mock("./tools/executions.js", () => ({ registerExecutionTools: registrations.executions }));
vi.mock("./tools/tags.js", () => ({ registerTagTools: registrations.tags }));
vi.mock("./tools/variables.js", () => ({ registerVariableTools: registrations.variables }));
vi.mock("./tools/credentials.js", () => ({ registerCredentialTools: registrations.credentials }));
vi.mock("./tools/users.js", () => ({ registerUserTools: registrations.users }));

import { SERVER_VERSION, createServer } from "./server.js";
import type { FetchFn } from "./types.js";

describe("createServer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives the server version from package metadata", () => {
    expect(SERVER_VERSION).toBe("2.0.0");
  });

  it("creates a v2 MCP server and registers every tool group", () => {
    const fetchFn: FetchFn = vi.fn();
    const server = createServer(fetchFn);

    expect(server).toBeInstanceOf(McpServer);
    for (const register of Object.values(registrations)) {
      expect(register).toHaveBeenCalledOnce();
      expect(register).toHaveBeenCalledWith(server, fetchFn);
    }
  });
});
