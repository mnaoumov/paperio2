/**
 * @file
 *
 * Tests the scaling of the integration tests' time limits.
 */

import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  readIntegrationTimeoutScale,
  scaleIntegrationTimeout
} from './integration-timeout.ts';

const VARIABLE = 'INTEGRATION_TIMEOUT_SCALE';
const LIMIT = 300_000;

describe('integration timeout scale', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the limits when the variable is unset or empty', () => {
    vi.stubEnv(VARIABLE, undefined);
    expect(scaleIntegrationTimeout(LIMIT)).toBe(LIMIT);
    vi.stubEnv(VARIABLE, ' ');
    expect(scaleIntegrationTimeout(LIMIT)).toBe(LIMIT);
  });

  it('multiplies the limits by the factor', () => {
    vi.stubEnv(VARIABLE, '2.5');
    expect(scaleIntegrationTimeout(LIMIT)).toBe(750_000);
  });

  it.each(['0', '-1', 'ten', 'Infinity'])('refuses %s', (value) => {
    vi.stubEnv(VARIABLE, value);
    expect(() => readIntegrationTimeoutScale()).toThrow(VARIABLE);
  });
});
