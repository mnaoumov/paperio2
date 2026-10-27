import {
  describe,
  expect,
  it
} from 'vitest';

import {
  distanceToSegment,
  pointInPolygon
} from './plane.ts';
import {
  hasOutlineClearance,
  simplifyGeometry
} from './precision.ts';

describe('hasOutlineClearance', () => {
  it('matches exact edge distance across points, corners and clearances', () => {
    const outline = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 10 }, { x: 0, y: 20 }];
    for (let x = -5; x <= 25; x += 5) {
      for (let y = -5; y <= 25; y += 5) {
        const point = { x, y };
        const distance = Math.min(...outline.map((start, index) => distanceToSegment(point, start, outline[(index + 1) % outline.length] ?? start)));
        for (const clearance of [0, 1, 3, 10]) {
          expect(hasOutlineClearance({ clearance, outline, point })).toBe(distance >= clearance);
        }
      }
    }
  });
});

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
