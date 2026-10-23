// Bundle the typed engine + its real preact / js-cookie dependencies into a
// single self-contained browser IIFE, equivalent in behavior to the original
// obfuscated `app2.js`. Drop the output in place of `app2.js` (served over
// HTTP) to run the game off this readable reconstruction.
import { build } from 'esbuild';

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

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/app2.js',
  define: { AUTOPILOT_WORKER_SOURCE: JSON.stringify(workerOutput.text) },
  legalComments: 'none',
  logLevel: 'info'
});
