// Bundle the typed engine + its real preact / js-cookie dependencies into a
// single self-contained browser IIFE, equivalent in behavior to the original
// obfuscated `app2.js`. Drop the output in place of `app2.js` (served over
// HTTP) to run the game off this readable reconstruction.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/app2.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/app2.js',
  legalComments: 'none',
  logLevel: 'info'
});
