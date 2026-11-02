import {
  describe,
  expect,
  it
} from 'vitest';

import { Segment } from '../geometry/shapes.ts';
import { Vector } from '../geometry/vector.ts';
import { geometryFingerprint } from './state.ts';

function segment(startX: number, startY: number, endX: number, endY: number): Segment {
  return new Segment(new Vector(startX, startY), new Vector(endX, endY));
}

describe('geometryFingerprint', () => {
  it('keeps the empty-trail marker used to recognize a closed loop', () => {
    expect(geometryFingerprint([])).toBe('0:2166136261:5381');
  });
  it('agrees for independently allocated copies of the same geometry', () => {
    expect(geometryFingerprint([segment(1, 2, 3, 4)])).toBe(geometryFingerprint([segment(1, 2, 3, 4)]));
  });
  it('detects changes to each coordinate, including one low bit of a double', () => {
    const original = geometryFingerprint([segment(1, 2, 3, 4)]);
    for (const changed of [segment(1 + Number.EPSILON, 2, 3, 4), segment(1, 3, 3, 4), segment(1, 2, 4, 4), segment(1, 2, 3, 5)]) {
      expect(geometryFingerprint([changed])).not.toBe(original);
    }
  });
  it('distinguishes coordinate order, segment order and repeated segments', () => {
    const alpha = segment(1, 2, 3, 4);
    const bravo = segment(5, 6, 7, 8);
    expect(geometryFingerprint([alpha])).not.toBe(geometryFingerprint([segment(2, 1, 3, 4)]));
    expect(geometryFingerprint([alpha, bravo])).not.toBe(geometryFingerprint([bravo, alpha]));
    expect(geometryFingerprint([alpha])).not.toBe(geometryFingerprint([alpha, alpha]));
  });
});
