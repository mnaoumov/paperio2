/**
 * @file
 *
 * The blackbox pilot plays from pixels only: its module may import nothing but the plain geometry beside it, so it
 * cannot reach the engine, and this test fails the moment it does.
 */

import { readFile } from 'node:fs/promises';
import {
  describe,
  expect,
  it
} from 'vitest';

const IMPORT_PATTERN = /\bfrom\s+'(?<specifier>[^']+)'/gu;

describe('the blackbox pilot', () => {
  it('imports nothing but its own plane geometry', async () => {
    const source = await readFile(new URL('../../src/autopilot/blackbox.ts', import.meta.url), 'utf8');
    const specifiers = [...source.matchAll(IMPORT_PATTERN)].map((match) => match.groups?.['specifier']);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => specifier !== './plane.ts')).toStrictEqual([]);
  });
});
