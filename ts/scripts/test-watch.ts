import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';

await execFromRoot(['npx', 'vitest', 'watch', '--project', 'unit-tests', '--project', 'unit-tests:scripts']);
