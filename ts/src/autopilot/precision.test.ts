import {
  describe,
  expect,
  it
} from 'vitest';

import { pointInPolygon } from './plane.ts';
import { simplifyGeometry } from './precision.ts';

describe('simplifyGeometry', () => {
  it('preserves a narrow notch that a proximity-only simplification can erase', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 18, y: 20 }, { x: 18, y: 1 }, { x: 16, y: 1 }, { x: 16, y: 20 }, { x: 0, y: 20 }];
    const reduced = simplifyGeometry({ closed: true, points, tolerance: 1 });
    expect(pointInPolygon({ x: 17, y: 10 }, reduced)).toBe(false);
    expect(pointInPolygon({ x: 10, y: 10 }, reduced)).toBe(true);
  });

  it('keeps sharp turns of a short trail', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
    expect(simplifyGeometry({ closed: false, points, tolerance: 1 })).toEqual(points);
  });

  it('reduces straight movement without changing the engine points', () => {
    const points = Array.from({ length: 100 }, (_unused, index) => ({ x: index, y: 0 }));
    const before = structuredClone(points);
    expect(simplifyGeometry({ closed: false, points, tolerance: 1 })).toEqual([{ x: 0, y: 0 }, { x: 99, y: 0 }]);
    expect(points).toEqual(before);
  });
});
