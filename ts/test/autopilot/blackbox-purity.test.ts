/**
 * @file
 *
 * The blackbox pilot plays from pixels only: its module, and every module it reaches, may import nothing but the plain
 * geometry and the odometer beside it, so it cannot reach the engine, and this test fails the moment it does.
 */

import { readFile } from 'node:fs/promises';
import {
  describe,
  expect,
  it
} from 'vitest';

const IMPORT_PATTERN = /\bfrom\s+'(?<specifier>[^']+)'/gu;
/** The modules beside the pilot it may import, each held to the same rule. */
const ALLOWED = ['./odometry.ts', './plane.ts'];

async function importsOf(module: string): Promise<(string | undefined)[]> {
  const source = await readFile(new URL(`../../src/autopilot/${module}`, import.meta.url), 'utf8');
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match.groups?.['specifier']);
}

describe('the blackbox pilot', () => {
  it('imports nothing but its own plane geometry and odometer', async () => {
    const pilotImports = await importsOf('blackbox.ts');
    expect(pilotImports.length).toBeGreaterThan(0);
    expect(pilotImports.filter((specifier) => !ALLOWED.includes(specifier ?? ''))).toStrictEqual([]);
    for (const module of ALLOWED) {
      const imports = await importsOf(module.replace('./', ''));
      expect(imports.filter((specifier) => !ALLOWED.includes(specifier ?? ''))).toStrictEqual([]);
    }
  });
});
