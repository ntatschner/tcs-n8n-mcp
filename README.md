# @thecodesaiyan/tcs-n8n-mcp

By [@TheCodeSaiyan](https://github.com/ntatschner)

An [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server for managing [n8n](https://n8n.io) workflow automation instances. Provides 22 tools for workflows, executions, tags, variables, credentials, and users.

## Installation

### Claude Code

Run the CLI command:

```bash
claude mcp add n8n -- npx -y @thecodesaiyan/tcs-n8n-mcp
```

Or add to `~/.claude.json`:

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

### Claude Desktop

Add to your config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

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

Restart Claude Desktop after saving.

### VS Code (Copilot)

Add to `.vscode/mcp.json` in your project, or open user config via Command Palette > `MCP: Open User Configuration`:

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

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

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

### Windsurf

Add to your config file:
- **Windows**: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`
- **macOS/Linux**: `~/.codeium/windsurf/mcp_config.json`

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

### Cline

Open MCP Servers > Configure > Advanced MCP Settings, and add:

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

> **Windows note**: If you encounter spawn errors with npx, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@thecodesaiyan/tcs-n8n-mcp"]` instead.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `N8N_API_KEY` | Yes | — | n8n API key ([how to create](https://docs.n8n.io/api/authentication/)) |
| `N8N_API_URL` | No | `http://localhost:5678` | Base URL of your n8n instance |

## Available Tools (22)

### Workflows (8)

| Tool | Description |
|------|-------------|
| `list_workflows` | List all workflows with pagination |
| `get_workflow` | Get full workflow details by ID |
| `create_workflow` | Create a new workflow |
| `update_workflow` | Update an existing workflow |
| `delete_workflow` | Delete a workflow (irreversible) |
| `activate_workflow` | Activate a workflow's triggers |
| `deactivate_workflow` | Deactivate a workflow |
| `execute_workflow` | Execute a workflow immediately |

### Executions (3)

| Tool | Description |
|------|-------------|
| `list_executions` | List executions with filters |
| `get_execution` | Get execution details and results |
| `delete_execution` | Delete an execution record |

### Tags (4)

| Tool | Description |
|------|-------------|
| `list_tags` | List all tags |
| `create_tag` | Create a new tag |
| `update_tag` | Rename a tag |
| `delete_tag` | Delete a tag |

### Variables (4)

| Tool | Description |
|------|-------------|
| `list_variables` | List all variables (values masked) |
| `create_variable` | Create a new variable |
| `update_variable` | Update a variable |
| `delete_variable` | Delete a variable |

### Credentials (1)

| Tool | Description |
|------|-------------|
| `list_credentials` | List credentials (metadata only) |

### Users (2)

| Tool | Description |
|------|-------------|
| `list_users` | List all users |
| `get_user` | Get user details |

## Security

- All resource IDs are validated as numeric strings to prevent path traversal
- Error responses are sanitised to avoid leaking n8n instance internals
- Variable values are masked in list output to prevent secret exposure
- All API calls have a 30-second timeout
- API keys are never logged or exposed in tool output
- Credentials tool only returns metadata (secrets are never exposed)

## Development

```bash
git clone https://github.com/ntatschner/tcs-n8n-mcp.git
cd tcs-n8n-mcp
npm install
npm run build
npm test
```

### Running locally

```bash
N8N_API_KEY=your-key N8N_API_URL=http://localhost:5678 npm start
```

## License

MIT
