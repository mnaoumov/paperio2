// Bundle the typed engine + its real preact / js-cookie dependencies into a
// single self-contained browser IIFE, equivalent in behavior to the original
// obfuscated `app2.js`. Drop the output in place of `app2.js` (served over
// HTTP) to run the game off this readable reconstruction.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

// The commit the bundle is built from, for the stats log's header; a build
// outside a git checkout leaves it out.
let commit;
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  commit = undefined;
}

// The autopilot's worker is bundled first and inlined into the game's bundle as
// a string (`AUTOPILOT_WORKER_SOURCE`), which the page starts from a blob, so
// the build still ships one file.
const worker = await build({
  entryPoints: ['src/autopilot/worker.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
  logLevel: 'info'
});
const [workerOutput] = worker.outputFiles;
const realm = await build({
  entryPoints: ['src/rollout/runtime.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  define: { ROLLOUT_SKINS_SOURCE: JSON.stringify(readFileSync('../assets/skins/skins.json', 'utf8')) },
  legalComments: 'none',
  logLevel: 'info'
});
const [realmOutput] = realm.outputFiles;

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/app2.js',
  define: { ROLLOUT_SOURCE: JSON.stringify(realmOutput.text), AUTOPILOT_WORKER_SOURCE: JSON.stringify(workerOutput.text), BUILD_COMMIT: JSON.stringify(commit ?? null) },
  legalComments: 'none',
  logLevel: 'info'
});
