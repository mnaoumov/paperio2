import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['dist', 'node_modules'];
const SCRIPTS_TEST_FILES = 'scripts/**/*.test.ts';
const INTEGRATION_TEST_FILES = 'test/**/*.integration.test.ts';
const TEST_FOLDER_UNIT_FILES = 'test/**/*.test.ts';
const INTEGRATION_TEST_TIMEOUT_MILLISECONDS = 300_000;

export const config = defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/**/@types/**',
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/index.ts'
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage'
    },
    exclude: SHARED_EXCLUDE,
    globals: false,
    passWithNoTests: true,
    projects: [
      {
        test: {
          environment: 'node',
          exclude: [...SHARED_EXCLUDE, 'scripts/**'],
          include: ['src/**/*.test.ts'],
          name: 'unit-tests'
        }
      },
      {
        /*
         * The scripts tree, which `unit-tests` excludes outright: without this project a test file under
         * `scripts/` ran nowhere and `npm test` stayed green while proving nothing.
         * No test lives there today, so it runs empty, but a test added there later is picked up rather than
         * silently skipped. Its shape (name included) is the one `typescript-template` uses, so the two configs
         * stay comparable.
         */
        test: {
          environment: 'node',
          exclude: SHARED_EXCLUDE,
          include: [SCRIPTS_TEST_FILES],
          name: 'unit-tests:scripts'
        }
      },
      {
        /*
         * Fast tests that need Node (they read source files), so they live in `test/` under its Node config rather
         * than beside the browser sources. The integration tests in the same folder are left to their own project.
         */
        test: {
          environment: 'node',
          exclude: [...SHARED_EXCLUDE, INTEGRATION_TEST_FILES],
          include: [TEST_FOLDER_UNIT_FILES],
          name: 'unit-tests:test'
        }
      },
      {
        /*
         * The differential test (`test/differential/`): it drives Chrome through every recorded scenario on both
         * the original `app2.js` and the reconstruction, so it is slow and needs a browser. `npm test` leaves it
         * out; `npm run test:integration` and CI run it.
         */
        test: {
          environment: 'node',
          exclude: SHARED_EXCLUDE,
          fileParallelism: false,
          hookTimeout: INTEGRATION_TEST_TIMEOUT_MILLISECONDS,
          include: [INTEGRATION_TEST_FILES],
          name: 'integration-tests',
          testTimeout: INTEGRATION_TEST_TIMEOUT_MILLISECONDS
        }
      }
    ]
  }
});
