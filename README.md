<div align="center">

# @thecodesaiyan/tcs-n8n-mcp

**Manage your n8n workflows through AI assistants**

[![npm version](https://img.shields.io/npm/v/@thecodesaiyan/tcs-n8n-mcp?color=blue&label=npm)](https://www.npmjs.com/package/@thecodesaiyan/tcs-n8n-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.14-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple)](https://modelcontextprotocol.io)
[![CI](https://github.com/ntatschner/tcs-n8n-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ntatschner/tcs-n8n-mcp/actions/workflows/ci.yml)

An [MCP](https://modelcontextprotocol.io) server for managing supported parts of the [n8n](https://n8n.io) public API. It exposes workflows, executions, tags, variables, credential metadata, and users to MCP clients through typed, structured tools.

[Installation](#installation) · [Tools](#available-tools-21) · [Security](#security) · [Development](#development)

</div>

---

## Features

- **21 tools** for common n8n public API operations
- **Works everywhere** — Claude Code, Claude Desktop, VS Code, Cursor, Windsurf, Cline
- **Modern MCP responses** — MCP SDK v2, structured content, output schemas, and tool safety annotations
- **Secure by default** — encoded resource IDs, sanitised errors, bounded responses, and request timeouts
- **Flexible authentication** — n8n API key (default), with Bearer and Basic modes for compatible proxies/deployments
- **Zero config** — just provide your n8n API key and go
- **Focused dependencies** — runtime dependencies are limited to the MCP server SDK and Zod

---

## Prerequisites

- [Node.js](https://nodejs.org) >= 22.14 (Node 24 LTS is recommended)
- An [n8n](https://n8n.io) instance (self-hosted or cloud)
- An n8n API key ([how to create one](https://docs.n8n.io/api/authentication/))

---

## Installation

### Quick Start

```bash
npx @thecodesaiyan/tcs-n8n-mcp --setup
```

The setup wizard walks you through configuration, reads the API key or password without terminal echo, tests your connection, and configures detected clients. Printed fallback snippets use a `<set-in-client-config>` placeholder so credentials are not written to terminal logs.

> **Windows users:** `npx` cannot resolve bin commands from scoped packages on Windows. Install globally instead:
>
> ```bash
> npm install -g @thecodesaiyan/tcs-n8n-mcp
> tcs-n8n-mcp --setup
> ```

### Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `N8N_API_KEY` | Yes | — | Your n8n API key (or password for basic auth) |
| `N8N_API_URL` | No | `http://localhost:5678` | Absolute HTTP(S) URL for your n8n instance; either the instance root or a URL ending in `/api/v1` |
| `N8N_AUTH_TYPE` | No | `apikey` | Authentication method: `apikey`, `bearer`, or `basic` |
| `N8N_API_USER` | Only for `basic` | — | Username for basic authentication |
| `N8N_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |

#### Authentication Types

- **`apikey`** (default) — Sends `X-N8N-API-KEY` header. This is n8n's standard API authentication.
- **`bearer`** — Sends `Authorization: Bearer <token>`, for deployments or reverse proxies that accept it.
- **`basic`** — Sends `Authorization: Basic <base64>`, for compatible deployments or reverse proxies. Requires `N8N_API_USER`.

`N8N_API_URL` must not contain embedded credentials, a query string, or a fragment. The server normalises the URL so `/api/v1` is appended exactly once.

---

### Client Setup

<details>
<summary><strong>Claude Code</strong></summary>

#### Option A: Interactive wizard

```bash
npx @thecodesaiyan/tcs-n8n-mcp --setup
```

#### Option B: CLI command

**macOS / Linux:**

```bash
claude mcp add n8n -e N8N_API_URL=http://localhost:5678 -e N8N_API_KEY=your-api-key -- npx -y @thecodesaiyan/tcs-n8n-mcp
```

**Windows** (install globally first):

```bash
npm install -g @thecodesaiyan/tcs-n8n-mcp
claude mcp add n8n -e N8N_API_URL=http://localhost:5678 -e N8N_API_KEY=your-api-key -- tcs-n8n-mcp
```

#### Option C: Manual config

Add to `~/.claude.json`:

**macOS / Linux:**

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

**Windows:**

```json
{
  "mcpServers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
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

**macOS / Linux:**

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

**Windows** (run `npm install -g @thecodesaiyan/tcs-n8n-mcp` first):

```json
{
  "mcpServers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
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

**macOS / Linux:**

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

**Windows** (run `npm install -g @thecodesaiyan/tcs-n8n-mcp` first):

```json
{
  "servers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
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

**macOS / Linux:**

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

**Windows** (run `npm install -g @thecodesaiyan/tcs-n8n-mcp` first):

```json
{
  "mcpServers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
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

**macOS / Linux:**

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

**Windows** (run `npm install -g @thecodesaiyan/tcs-n8n-mcp` first):

```json
{
  "mcpServers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
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

**macOS / Linux:**

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

**Windows** (run `npm install -g @thecodesaiyan/tcs-n8n-mcp` first):

```json
{
  "mcpServers": {
    "n8n": {
      "command": "tcs-n8n-mcp",
      "args": [],
      "env": {
        "N8N_API_KEY": "your-api-key-here",
        "N8N_API_URL": "http://localhost:5678"
      }
    }
  }
}
```

</details>

---

## Available Tools (21)

### Workflows (7)

| Tool | Description |
|:-----|:------------|
| `list_workflows` | List all workflows with pagination |
| `get_workflow` | Get safe workflow metadata; set `includeRawData: true` to opt into untrusted raw fields |
| `create_workflow` | Create a new workflow with optional nodes and connections |
| `update_workflow` | Update an existing workflow's name, nodes, connections, or settings |
| `delete_workflow` | Permanently delete a workflow after explicit confirmation |
| `activate_workflow` | Activate a workflow so it runs on its configured triggers |
| `deactivate_workflow` | Deactivate a workflow to stop trigger-based execution |

The n8n public API does not expose a portable `POST /workflows/{id}/execute` operation, so this package does not offer direct workflow execution. To run a workflow on demand, expose and call a webhook trigger or use an n8n-supported test/execution facility appropriate to your deployment.

### Executions (3)

| Tool | Description |
|:-----|:------------|
| `list_executions` | List executions with optional filters for workflow ID and status |
| `get_execution` | Get safe execution metadata; `includeData: true` opts into untrusted node data |
| `delete_execution` | Delete an execution record after explicit confirmation |

### Tags (4)

| Tool | Description |
|:-----|:------------|
| `list_tags` | List all tags used for organising workflows |
| `create_tag` | Create a new tag |
| `update_tag` | Rename an existing tag |
| `delete_tag` | Delete a tag after explicit confirmation |

### Variables (4)

| Tool | Description |
|:-----|:------------|
| `list_variables` | List all environment variables (values are masked for security) |
| `create_variable` | Create a new key-value environment variable |
| `update_variable` | Update an existing variable's key or value |
| `delete_variable` | Delete an environment variable after explicit confirmation |

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
| **Resource IDs** | Opaque n8n IDs are accepted and URL-encoded as individual path segments; execution IDs remain numeric |
| **Destructive confirmation** | Delete tools require an explicit `confirm: true` argument and are marked destructive |
| **Error Sanitisation** | API failures return bounded, actionable details without dumping arbitrary response bodies |
| **Secret Masking** | Variable values are hidden in list output to prevent accidental secret exposure |
| **Request Timeout** | All API calls have a configurable timeout (default 30s) to prevent hanging connections |
| **Credential handling** | Interactive credential entry is hidden; client config files are atomically replaced with mode `0600` on POSIX |
| **Credential Safety** | The credentials tool only returns metadata — secrets are never exposed |
| **Redirect Safety** | API redirects are refused so custom authentication headers cannot cross origins |
| **Response Limits** | API bodies are byte-limited before JSON parsing; model-visible results are separately bounded |
| **Header Injection Prevention** | Basic auth credentials are validated to reject control characters |

MCP client configuration stores `N8N_API_KEY` (or the Basic password) in plaintext because stdio clients pass credentials through environment variables. Restrict access to these files. Automatic setup tightens the resulting file to `0600` on POSIX; Windows users should verify the file ACL. Printed manual snippets contain a credential placeholder, never the entered secret.

Tool results are bounded to protect the model context. Use pagination and request execution data only when needed. The server supports the documented tools above, not the entire n8n REST API; availability can also vary by n8n edition and version.

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
# API key auth (default)
N8N_API_KEY=your-key N8N_API_URL=http://localhost:5678 npm start

# Bearer token auth
N8N_AUTH_TYPE=bearer N8N_API_KEY=your-token N8N_API_URL=http://localhost:5678 npm start

# Basic auth
N8N_AUTH_TYPE=basic N8N_API_USER=admin N8N_API_KEY=password N8N_API_URL=http://localhost:5678 npm start
```

### Project Structure

```
src/
  index.ts              Thin CLI and stdio entry point
  server.ts             MCP server factory and tool registration
  client.ts             Normalised, timeout-aware n8n API client
  config.ts             Auth type parsing, header building, timeout, connection check
  types.ts              Shared types, response validation and bounded output helpers
  validation.ts         Zod schemas for input validation
  tools/
    workflows.ts        Workflow CRUD and activation
    executions.ts       Execution listing and management
    tags.ts             Tag CRUD operations
    variables.ts        Environment variable management
    credentials.ts      Credential metadata listing
    users.ts            User listing and details
```

### Publishing

Releases are tag-driven. Set `package.json` to the intended version, then push the matching `v<version>` tag. CI verifies that the tag exactly matches `package.json`, runs the supported Node matrix, coverage, audit, pack, and installed-tarball smoke checks, publishes to npm, and only then creates the GitHub release.

The npm package must have a trusted publisher configured for this GitHub repository and `.github/workflows/ci.yml`. Publishing uses GitHub Actions OIDC with provenance and does not use a long-lived `NPM_TOKEN`.

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
