import { execFromRoot } from '@mnaoumov/typescript-dev-toolkit/root';
import process from 'node:process';

async function main(): Promise<void> {
  const [, , ...paths] = process.argv;
  await spellcheck(paths);
}

async function spellcheck(paths: string[] = []): Promise<void> {
  if (paths.length === 0) {
    paths = ['.'];
  }

  await execFromRoot(['npx', 'cspell', '--no-progress', '--no-must-find-files', { batchedArguments: paths }]);
}

await main();
