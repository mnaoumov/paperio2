/**
 * @file
 *
 * The integration tests' time limits, scaled by `INTEGRATION_TIMEOUT_SCALE`.
 *
 * The limits are set for a machine that gives the browser its cores. On a machine shared with other work the long
 * scenarios run several times slower and hit them while still passing, so a slow run can raise every limit at once
 * without editing a test: `INTEGRATION_TIMEOUT_SCALE=10 npm run test:integration`. Unset, empty or `1` keeps the
 * limits as they are, which is what CI runs.
 */

const DEFAULT_SCALE = 1;
const UNSCALED_TEST_TIMEOUT_MILLISECONDS = 300_000;

/**
 * Reads the scale factor from the environment.
 *
 * @returns The factor every integration-test time limit is multiplied by.
 * @throws If the variable is set to anything but a positive number.
 */
export function readIntegrationTimeoutScale(): number {
  const raw = process.env['INTEGRATION_TIMEOUT_SCALE']?.trim() ?? '';
  if (raw === '') {
    return DEFAULT_SCALE;
  }
  const scale = Number(raw);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`INTEGRATION_TIMEOUT_SCALE must be a positive number, got '${raw}'.`);
  }
  return scale;
}

/**
 * Scales one time limit.
 *
 * @param milliseconds - The limit on an unloaded machine.
 * @returns The limit to use in this run.
 */
export function scaleIntegrationTimeout(milliseconds: number): number {
  return Math.round(milliseconds * readIntegrationTimeoutScale());
}

/** The time limit of one integration test or hook. */
export const INTEGRATION_TEST_TIMEOUT_MILLISECONDS = scaleIntegrationTimeout(UNSCALED_TEST_TIMEOUT_MILLISECONDS);
