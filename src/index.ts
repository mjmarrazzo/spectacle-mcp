import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadSpec, ensureSpec } from './spec.js';
import {
  formatSpecLoaded,
  formatEndpointsCompact,
  formatEndpointsGrouped,
  formatEndpointBrief,
  formatEndpointNormal,
  formatEndpointFull,
  formatSearchSnippets,
  formatSearchIds,
  formatSearchFull,
  searchOperations,
} from './format.js';

const server = new McpServer({
  name: 'spectacle',
  version: '0.1.0',
});

// --- Tool: spec_load ---

server.registerTool('spec_load', {
  description: 'Load an OpenAPI spec from a local file path. Converts Swagger 2.0 automatically.',
  inputSchema: {
    spec_path: z.string().describe('Absolute or relative path to the OpenAPI/Swagger spec file'),
    force_reload: z.boolean().default(false).describe('Force reload even if cached'),
  },
}, async ({ spec_path, force_reload }) => {
  const cached = await loadSpec(spec_path, force_reload);
  return { content: [{ type: 'text', text: formatSpecLoaded(cached) }] };
});

// --- Tool: list_endpoints ---

server.registerTool('list_endpoints', {
  description: 'List all API endpoints in a loaded spec. Filter by method or tag.',
  inputSchema: {
    spec_path: z.string().describe('Path to the spec file'),
    method: z.string().optional().describe('Filter by HTTP method (GET, POST, etc.)'),
    tag: z.string().optional().describe('Filter by tag name'),
    format: z.enum(['compact', 'grouped']).default('compact').describe('Output format'),
  },
}, async ({ spec_path, method, tag, format }) => {
  const cached = await ensureSpec(spec_path);
  let ops = cached.operations;

  if (method) {
    const m = method.toUpperCase();
    ops = ops.filter(op => op.method === m);
  }
  if (tag) {
    const t = tag.toLowerCase();
    ops = ops.filter(op => op.tags.some(tg => tg.toLowerCase() === t));
  }

  const text = format === 'grouped'
    ? formatEndpointsGrouped(ops)
    : formatEndpointsCompact(ops);

  return { content: [{ type: 'text', text: text || 'No endpoints found.' }] };
});

// --- Tool: get_endpoint ---

server.registerTool('get_endpoint', {
  description: 'Get detailed information about a specific API endpoint.',
  inputSchema: {
    spec_path: z.string().describe('Path to the spec file'),
    path: z.string().describe('API path (e.g. /users/{id})'),
    method: z.string().describe('HTTP method (GET, POST, etc.)'),
    verbosity: z.enum(['brief', 'normal', 'full']).default('normal').describe('Detail level'),
  },
}, async ({ spec_path, path: apiPath, method, verbosity }) => {
  const cached = await ensureSpec(spec_path);
  const m = method.toUpperCase();
  const op = cached.operations.find(o => o.path === apiPath && o.method === m);

  if (!op) {
    return { content: [{ type: 'text', text: `No endpoint found: ${m} ${apiPath}` }] };
  }

  let text: string;
  switch (verbosity) {
    case 'brief': text = formatEndpointBrief(op); break;
    case 'full': text = formatEndpointFull(op); break;
    default: text = formatEndpointNormal(op); break;
  }

  return { content: [{ type: 'text', text }] };
});

// --- Tool: search_endpoints ---

server.registerTool('search_endpoints', {
  description: 'Search API endpoints by keyword. AND semantics — all terms must match.',
  inputSchema: {
    spec_path: z.string().describe('Path to the spec file'),
    q: z.string().describe('Search query (space-separated terms)'),
    limit: z.number().default(10).describe('Max results to return'),
    return: z.enum(['snippets', 'ids', 'full']).default('snippets').describe('Output format'),
  },
}, async ({ spec_path, q, limit, return: returnFormat }) => {
  const cached = await ensureSpec(spec_path);
  const results = searchOperations(cached.operations, q, limit);

  if (results.length === 0) {
    return { content: [{ type: 'text', text: 'No matching endpoints found.' }] };
  }

  let text: string;
  switch (returnFormat) {
    case 'ids': text = formatSearchIds(results); break;
    case 'full': text = formatSearchFull(results); break;
    default: text = formatSearchSnippets(results); break;
  }

  return { content: [{ type: 'text', text }] };
});

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
