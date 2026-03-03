import type { CachedSpec, IndexedOperation, Parameter, RequestBody, ResponseEntry } from './spec.js';

// --- spec_load output ---

export function formatSpecLoaded(spec: CachedSpec): string {
  const lines = [
    `Spec: ${spec.title} v${spec.version}`,
    `Paths: ${spec.pathCount}`,
    `Operations: ${spec.operations.length}`,
  ];
  if (spec.warnings.length > 0) {
    lines.push(`Warnings: ${spec.warnings.join('; ')}`);
  }
  return lines.join('\n');
}

// --- list_endpoints output ---

export function formatEndpointsCompact(ops: IndexedOperation[]): string {
  return ops
    .map(op => `${op.method.padEnd(7)} ${op.path}`)
    .join('\n');
}

export function formatEndpointsGrouped(ops: IndexedOperation[]): string {
  const grouped = new Map<string, IndexedOperation[]>();
  for (const op of ops) {
    const tag = op.tags[0] || 'Other';
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(op);
  }

  const sections: string[] = [];
  for (const [tag, tagOps] of grouped) {
    const lines = [`${tag}\n`];
    for (const op of tagOps) {
      const desc = op.summary || op.operationId || '';
      lines.push(`  ${op.method.padEnd(7)} ${op.path}${desc ? ` — ${desc}` : ''}`);
    }
    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// --- get_endpoint output ---

export function formatEndpointBrief(op: IndexedOperation): string {
  const lines = [`${op.method} ${op.path}`];
  if (op.summary) lines.push(`Summary: ${op.summary}`);
  if (op.tags.length) lines.push(`Tags: ${op.tags.join(', ')}`);
  return lines.join('\n');
}

export function formatEndpointNormal(op: IndexedOperation): string {
  const lines = [`${op.method} ${op.path}`];

  if (op.summary) lines.push(`Summary: ${op.summary}`);
  if (op.description) lines.push(`Description: ${op.description}`);

  // Auth
  if (op.security.length > 0) {
    const auth = op.security.map(s =>
      s.scopes.length ? `${s.name} (${s.scopes.join(', ')})` : s.name
    ).join(', ');
    lines.push(`\nAuth: ${auth}`);
  }

  // Parameters
  const pathParams = op.parameters.filter(p => p.in === 'path');
  const queryParams = op.parameters.filter(p => p.in === 'query');
  const headerParams = op.parameters.filter(p => p.in === 'header');

  if (pathParams.length || queryParams.length || headerParams.length) {
    lines.push('\nRequest');
    if (pathParams.length) {
      lines.push('  Path params:');
      for (const p of pathParams) lines.push(formatParam(p));
    }
    if (queryParams.length) {
      lines.push('  Query params:');
      for (const p of queryParams) lines.push(formatParam(p));
    }
    if (headerParams.length) {
      lines.push('  Headers:');
      for (const p of headerParams) lines.push(formatParam(p));
    }
  }

  // Request body
  if (op.requestBody) {
    if (!pathParams.length && !queryParams.length && !headerParams.length) {
      lines.push('\nRequest');
    }
    lines.push(formatRequestBody(op.requestBody, false));
  }

  // Responses
  if (op.responses.length) {
    lines.push('\nResponses');
    for (const r of op.responses) {
      lines.push(formatResponse(r, false));
    }
  }

  return lines.join('\n');
}

export function formatEndpointFull(op: IndexedOperation): string {
  const lines = [`${op.method} ${op.path}`];

  if (op.operationId) lines.push(`OperationId: ${op.operationId}`);
  if (op.summary) lines.push(`Summary: ${op.summary}`);
  if (op.description) lines.push(`Description: ${op.description}`);
  if (op.tags.length) lines.push(`Tags: ${op.tags.join(', ')}`);

  // Auth
  if (op.security.length > 0) {
    const auth = op.security.map(s =>
      s.scopes.length ? `${s.name} (${s.scopes.join(', ')})` : s.name
    ).join(', ');
    lines.push(`\nAuth: ${auth}`);
  }

  // Parameters
  const pathParams = op.parameters.filter(p => p.in === 'path');
  const queryParams = op.parameters.filter(p => p.in === 'query');
  const headerParams = op.parameters.filter(p => p.in === 'header');

  if (pathParams.length || queryParams.length || headerParams.length || op.requestBody) {
    lines.push('\nRequest');
    if (pathParams.length) {
      lines.push('  Path params:');
      for (const p of pathParams) lines.push(formatParam(p));
    }
    if (queryParams.length) {
      lines.push('  Query params:');
      for (const p of queryParams) lines.push(formatParam(p));
    }
    if (headerParams.length) {
      lines.push('  Headers:');
      for (const p of headerParams) lines.push(formatParam(p));
    }
  }

  // Request body (full schema)
  if (op.requestBody) {
    lines.push(formatRequestBody(op.requestBody, true));
  }

  // Responses (full schema)
  if (op.responses.length) {
    lines.push('\nResponses');
    for (const r of op.responses) {
      lines.push(formatResponse(r, true));
    }
  }

  return lines.join('\n');
}

// --- search output ---

export function formatSearchSnippets(results: ScoredResult[]): string {
  return results
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.op.method} ${r.op.path}`];
      if (r.op.summary) lines.push(`   summary: ${r.op.summary}`);
      if (r.op.parameters.length) {
        lines.push(`   params: ${r.op.parameters.map(p => p.name).join(', ')}`);
      }
      if (r.op.requestBody) {
        const bodyFields = schemaFieldNames(r.op.requestBody.schema);
        if (bodyFields.length) lines.push(`   body: ${bodyFields.join(', ')}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function formatSearchIds(results: ScoredResult[]): string {
  return results
    .map((r, i) => `${i + 1}. ${r.op.method} ${r.op.path}${r.op.operationId ? ` (${r.op.operationId})` : ''}`)
    .join('\n');
}

export function formatSearchFull(results: ScoredResult[]): string {
  return results
    .map((r, i) => `--- Result ${i + 1} ---\n${formatEndpointNormal(r.op)}`)
    .join('\n\n');
}

// --- Search scoring ---

export interface ScoredResult {
  op: IndexedOperation;
  score: number;
}

export function searchOperations(ops: IndexedOperation[], query: string, limit: number): ScoredResult[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const results: ScoredResult[] = [];

  for (const op of ops) {
    // AND semantics: all tokens must appear in searchBlob
    const allMatch = tokens.every(t => op.searchBlob.includes(t));
    if (!allMatch) continue;

    // Score by where tokens match (higher priority fields = higher score)
    let score = 0;
    const pathMethod = `${op.method} ${op.path}`.toLowerCase();
    const opId = op.operationId.toLowerCase();
    const summary = op.summary.toLowerCase();
    const tags = op.tags.join(' ').toLowerCase();
    const params = op.parameters.map(p => p.name).join(' ').toLowerCase();
    const desc = op.description.toLowerCase();

    for (const t of tokens) {
      if (pathMethod.includes(t)) score += 10;
      if (opId.includes(t)) score += 8;
      if (summary.includes(t)) score += 6;
      if (tags.includes(t)) score += 4;
      if (params.includes(t)) score += 3;
      if (desc.includes(t)) score += 1;
    }

    results.push({ op, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// --- Helpers ---

function formatParam(p: Parameter): string {
  const type = schemaType(p.schema);
  const req = p.required ? 'required' : 'optional';
  const desc = p.description ? ` — ${p.description}` : '';
  return `    ${p.name} (${type}, ${req})${desc}`;
}

function formatRequestBody(body: RequestBody, full: boolean): string {
  const lines = [`  Body (${body.contentType}):`];
  if (body.description) lines.push(`    ${body.description}`);
  if (body.schema) {
    if (full) {
      lines.push(indentSchema(body.schema, 4));
    } else {
      lines.push(schemaPreview(body.schema, 4));
    }
  }
  return lines.join('\n');
}

function formatResponse(r: ResponseEntry, full: boolean): string {
  const ct = r.contentType ? ` (${r.contentType})` : '';
  const lines = [`  ${r.status} ${r.description}${ct}`];
  if (r.schema) {
    if (full) {
      lines.push(indentSchema(r.schema, 4));
    } else {
      lines.push(schemaPreview(r.schema, 4));
    }
  }
  return lines.join('\n');
}

function schemaType(schema: any): string {
  if (!schema) return 'any';
  if (schema.type === 'array' && schema.items) {
    return `${schemaType(schema.items)}[]`;
  }
  if (schema.enum) return schema.enum.join(' | ');
  return schema.type || schema.format || 'object';
}

function schemaPreview(schema: any, indent: number): string {
  const pad = ' '.repeat(indent);
  if (!schema) return `${pad}(no schema)`;

  if (schema.type === 'array' && schema.items) {
    return `${pad}[\n${schemaPreview(schema.items, indent + 2)}\n${pad}]`;
  }

  if (schema.properties) {
    const lines = [`${pad}{`];
    for (const [key, val] of Object.entries(schema.properties)) {
      const v = val as any;
      const type = schemaType(v);
      const req = (schema.required || []).includes(key) ? '' : '?';
      lines.push(`${pad}  ${key}${req}: ${type}`);
    }
    lines.push(`${pad}}`);
    return lines.join('\n');
  }

  return `${pad}${schemaType(schema)}`;
}

function indentSchema(schema: any, indent: number): string {
  const json = JSON.stringify(schema, null, 2);
  const pad = ' '.repeat(indent);
  return json.split('\n').map(line => pad + line).join('\n');
}

function schemaFieldNames(schema: any): string[] {
  if (!schema) return [];
  if (schema.properties) return Object.keys(schema.properties);
  if (schema.items?.properties) return Object.keys(schema.items.properties);
  return [];
}
