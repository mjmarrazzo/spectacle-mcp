import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import converter from 'swagger2openapi';

// --- Types ---

export interface IndexedOperation {
  method: string;          // uppercase: GET, POST, etc.
  path: string;            // e.g. /users/{id}
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: Parameter[];
  requestBody: RequestBody | null;
  responses: ResponseEntry[];
  security: SecurityRequirement[];
  searchBlob: string;      // precomputed lowercase text for search
}

export interface Parameter {
  name: string;
  in: string;              // path, query, header, cookie
  required: boolean;
  description: string;
  schema: any;             // depth-limited expanded schema
}

export interface RequestBody {
  description: string;
  required: boolean;
  contentType: string;
  schema: any;             // depth-limited expanded schema
}

export interface ResponseEntry {
  status: string;          // "200", "400", etc.
  description: string;
  contentType: string | null;
  schema: any | null;      // depth-limited expanded schema
}

export interface SecurityRequirement {
  name: string;
  scopes: string[];
}

export interface CachedSpec {
  specPath: string;
  fileSize: number;
  fileMtime: number;
  title: string;
  version: string;
  spec: any;               // the raw OpenAPI 3.x object
  operations: IndexedOperation[];
  pathCount: number;
  warnings: string[];
}

// --- Cache ---

const cache = new Map<string, CachedSpec>();

export async function loadSpec(specPath: string, forceReload: boolean): Promise<CachedSpec> {
  const resolved = path.resolve(specPath);
  const stat = fs.statSync(resolved);
  const size = stat.size;
  const mtime = stat.mtimeMs;

  // Check cache
  if (!forceReload) {
    const cached = cache.get(resolved);
    if (cached && cached.fileSize === size && cached.fileMtime === mtime) {
      return cached;
    }
  }

  // Load file
  const raw = fs.readFileSync(resolved, 'utf-8');
  const ext = path.extname(resolved).toLowerCase();
  let parsed: any;
  if (ext === '.yaml' || ext === '.yml') {
    parsed = yaml.load(raw);
  } else {
    parsed = JSON.parse(raw);
  }

  const warnings: string[] = [];

  // Convert Swagger 2.0 → OpenAPI 3.x
  if (parsed.swagger && parsed.swagger.startsWith('2.')) {
    try {
      const result = await converter.convertObj(parsed, { patch: true, warnOnly: true });
      parsed = result.openapi;
      warnings.push('Converted from Swagger 2.0 to OpenAPI 3.x');
    } catch (err: any) {
      throw new Error(`Swagger 2.0 conversion failed: ${err.message}`);
    }
  }

  // Validate it looks like OpenAPI 3.x
  if (!parsed.openapi || !parsed.paths) {
    throw new Error('Not a valid OpenAPI 3.x specification');
  }

  // Build index
  const operations = buildIndex(parsed);

  const entry: CachedSpec = {
    specPath: resolved,
    fileSize: size,
    fileMtime: mtime,
    title: parsed.info?.title || 'Untitled',
    version: parsed.info?.version || 'unknown',
    spec: parsed,
    operations,
    pathCount: Object.keys(parsed.paths).length,
    warnings,
  };

  cache.set(resolved, entry);
  return entry;
}

export function getSpec(specPath: string): CachedSpec | undefined {
  return cache.get(path.resolve(specPath));
}

export async function ensureSpec(specPath: string): Promise<CachedSpec> {
  const existing = getSpec(specPath);
  if (existing) return existing;
  return loadSpec(specPath, false);
}

// --- $ref Resolution ---

function resolveRef(spec: any, ref: string): any {
  // ref format: "#/components/schemas/User"
  const parts = ref.replace(/^#\//, '').split('/');
  let current = spec;
  for (const part of parts) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function expandSchema(spec: any, schema: any, depth: number, visited: Set<string> = new Set()): any {
  if (!schema || depth <= 0) {
    if (schema?.$ref) {
      const name = schema.$ref.split('/').pop();
      return { type: 'object', description: `(see ${name})` };
    }
    return schema;
  }

  if (schema.$ref) {
    if (visited.has(schema.$ref)) {
      const name = schema.$ref.split('/').pop();
      return { type: 'object', description: `(circular: ${name})` };
    }
    visited = new Set(visited);
    visited.add(schema.$ref);
    const resolved = resolveRef(spec, schema.$ref);
    if (!resolved) return schema;
    return expandSchema(spec, resolved, depth - 1, visited);
  }

  // Handle allOf/oneOf/anyOf
  for (const keyword of ['allOf', 'oneOf', 'anyOf']) {
    if (schema[keyword]) {
      return {
        ...schema,
        [keyword]: schema[keyword].map((s: any) => expandSchema(spec, s, depth - 1, visited)),
      };
    }
  }

  // Handle object properties
  if (schema.properties) {
    const expanded: any = { ...schema, properties: {} };
    for (const [key, val] of Object.entries(schema.properties)) {
      expanded.properties[key] = expandSchema(spec, val as any, depth - 1, visited);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      expanded.additionalProperties = expandSchema(spec, schema.additionalProperties, depth - 1, visited);
    }
    return expanded;
  }

  // Handle array items
  if (schema.items) {
    return { ...schema, items: expandSchema(spec, schema.items, depth - 1, visited) };
  }

  return schema;
}

// --- Indexer ---

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const MAX_SCHEMA_DEPTH = 3;

function buildIndex(spec: any): IndexedOperation[] {
  const operations: IndexedOperation[] = [];

  for (const [pathStr, pathItem] of Object.entries(spec.paths || {})) {
    const pathObj = pathItem as any;
    const pathParams: Parameter[] = (pathObj.parameters || []).map((p: any) => parseParam(spec, p));

    for (const method of HTTP_METHODS) {
      const op = pathObj[method];
      if (!op) continue;

      // Merge path-level + operation-level parameters
      const opParams = (op.parameters || []).map((p: any) => parseParam(spec, p));
      const mergedParams = mergeParams(pathParams, opParams);

      // Parse request body
      let requestBody: RequestBody | null = null;
      if (op.requestBody) {
        requestBody = parseRequestBody(spec, op.requestBody);
      }

      // Parse responses — success first
      const responses = parseResponses(spec, op.responses || {});

      // Parse security
      const security = (op.security || spec.security || []).map((s: any) => {
        const [name, scopes] = Object.entries(s)[0] || ['unknown', []];
        return { name, scopes: scopes as string[] };
      });

      const indexed: IndexedOperation = {
        method: method.toUpperCase(),
        path: pathStr,
        operationId: op.operationId || '',
        summary: op.summary || '',
        description: op.description || '',
        tags: op.tags || [],
        parameters: mergedParams,
        requestBody,
        responses,
        security,
        searchBlob: '',
      };

      // Build search blob
      indexed.searchBlob = buildSearchBlob(indexed);
      operations.push(indexed);
    }
  }

  return operations;
}

function parseParam(spec: any, param: any): Parameter {
  if (param.$ref) {
    param = resolveRef(spec, param.$ref) || param;
  }
  return {
    name: param.name || '',
    in: param.in || '',
    required: param.required || false,
    description: param.description || '',
    schema: expandSchema(spec, param.schema, MAX_SCHEMA_DEPTH),
  };
}

function mergeParams(pathParams: Parameter[], opParams: Parameter[]): Parameter[] {
  const map = new Map<string, Parameter>();
  for (const p of pathParams) map.set(`${p.in}:${p.name}`, p);
  for (const p of opParams) map.set(`${p.in}:${p.name}`, p); // op-level overrides
  return Array.from(map.values());
}

function parseRequestBody(spec: any, body: any): RequestBody {
  if (body.$ref) {
    body = resolveRef(spec, body.$ref) || body;
  }
  const content = body.content || {};
  // Prefer application/json
  const contentType = content['application/json']
    ? 'application/json'
    : Object.keys(content)[0] || 'unknown';
  const mediaType = content[contentType] || {};

  return {
    description: body.description || '',
    required: body.required || false,
    contentType,
    schema: expandSchema(spec, mediaType.schema, MAX_SCHEMA_DEPTH),
  };
}

function parseResponses(spec: any, responses: any): ResponseEntry[] {
  const entries: ResponseEntry[] = [];
  const sorted = Object.entries(responses).sort(([a], [b]) => {
    // Success codes (2xx) first, then others numerically
    const aNum = parseInt(a) || 999;
    const bNum = parseInt(b) || 999;
    const aSuccess = aNum >= 200 && aNum < 300;
    const bSuccess = bNum >= 200 && bNum < 300;
    if (aSuccess && !bSuccess) return -1;
    if (!aSuccess && bSuccess) return 1;
    return aNum - bNum;
  });

  for (const [status, resp] of sorted) {
    const respObj = resp as any;
    const content = respObj.content || {};
    const contentType = content['application/json']
      ? 'application/json'
      : Object.keys(content)[0] || null;
    const mediaType = contentType ? content[contentType] : null;

    entries.push({
      status,
      description: respObj.description || '',
      contentType,
      schema: mediaType?.schema ? expandSchema(spec, mediaType.schema, MAX_SCHEMA_DEPTH) : null,
    });
  }

  return entries;
}

function buildSearchBlob(op: IndexedOperation): string {
  const parts = [
    op.method,
    op.path,
    op.operationId,
    op.summary,
    op.tags.join(' '),
    op.parameters.map(p => p.name).join(' '),
    op.description,
    op.requestBody ? JSON.stringify(op.requestBody.schema) : '',
    op.responses.map(r => `${r.status} ${r.description}`).join(' '),
  ];
  return parts.join(' ').toLowerCase();
}
