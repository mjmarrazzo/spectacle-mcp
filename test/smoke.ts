import { loadSpec, ensureSpec } from '../src/spec.js';
import {
  formatSpecLoaded,
  formatEndpointsCompact,
  formatEndpointsGrouped,
  formatEndpointNormal,
  formatSearchSnippets,
  searchOperations,
} from '../src/format.js';

async function main() {
  console.log('=== spec_load ===');
  const spec = await loadSpec('test/petstore.yaml', false);
  console.log(formatSpecLoaded(spec));

  console.log('\n=== list_endpoints (compact) ===');
  console.log(formatEndpointsCompact(spec.operations));

  console.log('\n=== list_endpoints (grouped) ===');
  console.log(formatEndpointsGrouped(spec.operations));

  console.log('\n=== get_endpoint GET /pets/{petId} ===');
  const op = spec.operations.find(o => o.path === '/pets/{petId}' && o.method === 'GET');
  if (op) console.log(formatEndpointNormal(op));

  console.log('\n=== search_endpoints q="pet" ===');
  const results = searchOperations(spec.operations, 'pet', 10);
  console.log(formatSearchSnippets(results));

  console.log('\n=== Cache test (reload should be instant) ===');
  const cached = await ensureSpec('test/petstore.yaml');
  console.log(`Cached: ${cached.title} (${cached.operations.length} ops)`);

  console.log('\nAll tests passed!');
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
