# Spectacle

An MCP server that lets Claude (and other MCP clients) query, search, and explore OpenAPI specifications. Point it at a spec file and ask questions about endpoints, parameters, schemas, and more.

Supports **OpenAPI 3.x** (JSON/YAML) and **Swagger 2.0** (auto-converted).

## Tools

| Tool | Description |
|------|-------------|
| `spec_load` | Load an OpenAPI/Swagger spec from a local file path |
| `list_endpoints` | List all endpoints, optionally filtered by HTTP method or tag |
| `get_endpoint` | Get detailed info about a specific endpoint (brief/normal/full verbosity) |
| `search_endpoints` | Full-text search across endpoints with relevance ranking |

## Setup

### Prerequisites

- Node.js 18+
- pnpm

### Install

```bash
git clone https://github.com/your-username/spectacle-mcp.git
cd spectacle-mcp
pnpm install
```

### Configure in Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "spectacle": {
      "command": "pnpm",
      "args": ["tsx", "/absolute/path/to/spectacle-mcp/src/index.ts"],
    }
  }
}
```

## Usage

Once configured, Claude can use the tools directly. Some example prompts:

> "Load the spec at ./openapi.yaml and list all endpoints"

> "What parameters does POST /users accept?"

> "Search the API for anything related to authentication"

> "Show me the full details of GET /orders/{id} including response schemas"

### Tool details

**`spec_load`** — Load and cache a spec. Swagger 2.0 files are automatically converted to OpenAPI 3.x. Specs are cached in memory and reloaded when the file changes.

**`list_endpoints`** — Two output formats:
- `compact` — one line per endpoint (`GET /pets`)
- `grouped` — organized by tag with summaries

**`get_endpoint`** — Three verbosity levels:
- `brief` — method, path, summary
- `normal` — adds parameters, request body, response codes
- `full` — adds complete expanded schemas

**`search_endpoints`** — Keyword search with AND semantics (all terms must match). Results are ranked by relevance with weighted field scoring (path > operationId > summary > tags > parameters > description). Three return formats: `snippets`, `ids`, or `full`.

## Development

```bash
pnpm start       # Run the MCP server
pnpm dev         # Run with file watching (auto-restart on changes)
```

### Running tests

```bash
pnpm tsx test/smoke.ts         # Integration tests
pnpm tsx test/swagger2-test.ts # Swagger 2.0 conversion tests
```

### Project structure

```
src/
  index.ts    — MCP server setup and tool registration
  spec.ts     — Spec loading, caching, $ref resolution, and indexing
  format.ts   — Output formatting and search scoring
test/
  petstore.yaml     — OpenAPI 3.0 test fixture
  swagger2.json     — Swagger 2.0 test fixture
  smoke.ts          — Integration tests
  swagger2-test.ts  — Conversion tests
```

