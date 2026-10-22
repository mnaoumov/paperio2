import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';

// The differential test needs Chrome and takes minutes, so it runs on its own: `npm run test:integration`.
await execFromRoot(['npx', 'vitest', 'run', '--project', 'unit-tests', '--project', 'unit-tests:scripts', '--project', 'unit-tests:test']);
