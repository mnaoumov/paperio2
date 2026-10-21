import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';

await execFromRoot(['npx', 'vitest', 'run', '--coverage', '--project', 'unit-tests', '--project', 'unit-tests:scripts']);
