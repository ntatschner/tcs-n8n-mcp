# Project: @thecodesaiyan/tcs-n8n-mcp

## Overview
MCP server for n8n workflow automation. Published to npm under @thecodesaiyan org.

## Key Info
- **npm**: `@thecodesaiyan/tcs-n8n-mcp`
- **bin command**: `tcs-n8n-mcp`
- **GitHub**: `ntatschner/tcs-n8n-mcp`
- **Transport**: stdio only
- **n8n API version**: v1

## Architecture
- `src/index.ts` - Entry point, shebang, fetch wrapper with 30s timeout
- `src/config.ts` - Auth parsing, header building, timeout config, connection check
- `src/types.ts` - FetchFn type, MCP response helpers (ok/err/handleError/safeJson), n8n API interfaces
- `src/validation.ts` - Zod schemas for ID validation (path traversal prevention)
- `src/tools/*.ts` - Tool modules: workflows (8), executions (3), tags (4), variables (4), credentials (1), users (2)

## Commands
- `npm run build` - Compile TypeScript to build/
- `npm test` - Run vitest
- `npm run test:coverage` - Coverage report

## Publishing
- Scoped package: requires `npm publish --access public`
- Uses granular npm token with 2FA bypass
- CI publishes automatically on GitHub release via `.github/workflows/publish.yml`
- Bump version in both `package.json` AND `src/index.ts` (server name + log message)

## Platform Notes
- ES module (`"type": "module"`) — top-level `await` is supported; prefer it over fire-and-forget `.then()`
- **Windows**: `npx -y @scoped/pkg` cannot resolve bin commands — must `npm install -g` and call bin directly
- Setup wizard auto-detects platform (`process.platform`) and outputs Windows-specific install instructions

## Security Patterns
- All resource IDs use `n8nId` schema (numeric only) - never interpolate raw strings into URL paths
- `handleError()` returns HTTP status only, never raw response body
- `list_variables` masks values - never expose variable values
- `safeJson()` wraps all `res.json()` calls - never let JSON parse throw
