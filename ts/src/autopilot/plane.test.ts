import {
  describe,
  expect,
  it
} from 'vitest';

import {
  distanceToSegment,
  pathLength,
  pointInPolygon,
  segmentDistance,
  segmentsIntersect,
  signedArea
} from './plane.ts';

const SQUARE = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('plane', () => {
  it('tells crossing segments from parallel and apart ones', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 6, y: -1 })).toBe(false);
  });

  it('measures the distance from a point to a segment and between segments', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segmentDistance({ x: 0, y: 2 }, { x: 10, y: 2 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(2);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0);
  });

  it('finds points inside a polygon and its signed area', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, SQUARE)).toBe(false);
    expect(signedArea(SQUARE)).toBe(100);
    expect(signedArea([...SQUARE].reverse())).toBe(-100);
  });

  it('sums a path', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
});
