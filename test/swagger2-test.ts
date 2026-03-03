import { loadSpec } from '../src/spec.js';

async function main() {
  const s = await loadSpec('test/swagger2.json', false);
  console.log(s.title, s.version, s.operations.length, 'ops', s.warnings);
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
