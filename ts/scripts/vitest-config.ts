import { defineConfig } from 'vitest/config';

const SHARED_EXCLUDE = ['dist', 'node_modules'];
const SCRIPTS_TEST_FILES = 'scripts/**/*.test.ts';

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
         * `scripts/helpers/eslint.test.ts` is the reason it exists. Its shape (name included) is the one
         * `typescript-template` uses, so the two configs stay comparable.
         */
        test: {
          environment: 'node',
          exclude: SHARED_EXCLUDE,
          include: [SCRIPTS_TEST_FILES],
          name: 'unit-tests:scripts'
        }
      }
    ]
  }
});
