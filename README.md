<div align="center">

# @thecodesaiyan/tcs-n8n-mcp

**Manage your n8n workflows through AI assistants**

[![npm version](https://img.shields.io/npm/v/@thecodesaiyan/tcs-n8n-mcp?color=blue&label=npm)](https://www.npmjs.com/package/@thecodesaiyan/tcs-n8n-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io)
[![CI](https://github.com/ntatschner/tcs-n8n-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ntatschner/tcs-n8n-mcp/actions/workflows/ci.yml)

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants full control over your [n8n](https://n8n.io) workflow automation platform. List, create, update, execute, and manage workflows, executions, tags, variables, credentials, and users — all through natural language.

[Installation](#installation) · [Tools](#available-tools-22) · [Security](#security) · [Development](#development)

</div>

---

## Features

- **22 tools** covering the full n8n REST API
- **Works everywhere** — Claude Code, Claude Desktop, VS Code, Cursor, Windsurf, Cline
- **Secure by default** — ID validation, sanitised errors, masked secrets, request timeouts
- **Zero config** — just provide your n8n API key and go
- **Lightweight** — under 30KB, no runtime dependencies beyond the MCP SDK and Zod

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 18
- An [n8n](https://n8n.io) instance (self-hosted or cloud)
- An n8n API key ([how to create one](https://docs.n8n.io/api/authentication/))

---

## Installation

### Quick Start

```bash
npx @thecodesaiyan/tcs-n8n-mcp
```

Set the required environment variables:

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `N8N_API_KEY` | Yes | — | Your n8n API key |
| `N8N_API_URL` | No | `http://localhost:5678` | Base URL of your n8n instance |

---

### Client Setup

<details>
<summary><strong>Claude Code</strong></summary>

#### Option A: CLI command

```bash
claude mcp add n8n -- npx -y @thecodesaiyan/tcs-n8n-mcp
```

#### Option B: Manual config

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to your Claude Desktop config file:

| OS | Path |
|----|------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

> Restart Claude Desktop after saving.

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add to `.vscode/mcp.json` in your project, or use **Command Palette** > `MCP: Open User Configuration`:

```json
{
  "servers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to your Windsurf config file:

| OS | Path |
|----|------|
| Windows | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` |
| macOS / Linux | `~/.codeium/windsurf/mcp_config.json` |

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cline</strong></summary>

Open **MCP Servers** > **Configure** > **Advanced MCP Settings** and add:

```json
{
  "mcpServers": {
    "n8n": {
      "command": "npx",
      "args": ["-y", "@thecodesaiyan/tcs-n8n-mcp"],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

> **Windows**: If you encounter spawn errors, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@thecodesaiyan/tcs-n8n-mcp"]`.

</details>

---

## Available Tools (22)

### Workflows (8)

| Tool | Description |
|:-----|:------------|
| `list_workflows` | List all workflows with pagination |
| `get_workflow` | Get full workflow details including nodes, connections, and settings |
| `create_workflow` | Create a new workflow with optional nodes and connections |
| `update_workflow` | Update an existing workflow's name, nodes, connections, or settings |
| `delete_workflow` | Permanently delete a workflow |
| `activate_workflow` | Activate a workflow so it runs on its configured triggers |
| `deactivate_workflow` | Deactivate a workflow to stop trigger-based execution |
| `execute_workflow` | Execute a workflow immediately and return the execution ID |

### Executions (3)

| Tool | Description |
|:-----|:------------|
| `list_executions` | List executions with optional filters for workflow ID and status |
| `get_execution` | Get full execution details including per-node results and errors |
| `delete_execution` | Delete an execution record |

### Tags (4)

| Tool | Description |
|:-----|:------------|
| `list_tags` | List all tags used for organising workflows |
| `create_tag` | Create a new tag |
| `update_tag` | Rename an existing tag |
| `delete_tag` | Delete a tag |

### Variables (4)

| Tool | Description |
|:-----|:------------|
| `list_variables` | List all environment variables (values are masked for security) |
| `create_variable` | Create a new key-value environment variable |
| `update_variable` | Update an existing variable's key or value |
| `delete_variable` | Delete an environment variable |

### Credentials (1)

| Tool | Description |
|:-----|:------------|
| `list_credentials` | List all credentials (metadata only — secrets are never exposed) |

### Users (2)

| Tool | Description |
|:-----|:------------|
| `list_users` | List all users with their roles and status |
| `get_user` | Get full details of a user by ID |

---

## Security

| Protection | Description |
|:-----------|:------------|
| **ID Validation** | All resource IDs are validated as numeric strings to prevent path traversal attacks |
| **Error Sanitisation** | API error responses only return HTTP status codes, never raw response bodies |
| **Secret Masking** | Variable values are hidden in list output to prevent accidental secret exposure |
| **Request Timeout** | All API calls have a 30-second timeout to prevent hanging connections |
| **No Key Logging** | API keys are never logged, echoed, or included in tool output |
| **Credential Safety** | The credentials tool only returns metadata — secrets are never exposed |

---

## Development

```bash
git clone https://github.com/ntatschner/tcs-n8n-mcp.git
cd tcs-n8n-mcp
npm install
```

### Commands

| Command | Description |
|:--------|:------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm test` | Run test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm start` | Start the MCP server |

### Running locally

```bash
N8N_API_KEY=your-key N8N_API_URL=http://localhost:5678 npm start
```

### Project Structure

```
src/
  index.ts              Entry point, fetch wrapper, server setup
  types.ts              Shared types, interfaces, response helpers
  validation.ts         Zod schemas for input validation
  tools/
    workflows.ts        Workflow CRUD, activation, execution
    executions.ts       Execution listing and management
    tags.ts             Tag CRUD operations
    variables.ts        Environment variable management
    credentials.ts      Credential metadata listing
    users.ts            User listing and details
```

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/my-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -m 'feat: add my feature'`)
5. Push to the branch (`git push origin feat/my-feature`)
6. Open a Pull Request

---

## License

[MIT](LICENSE) — Made by [@ntatschner](https://github.com/ntatschner)
