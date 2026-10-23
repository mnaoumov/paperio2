import {
  describe,
  expect,
  it
} from 'vitest';

import {
  BlackboxPilot,
  chamferDistance,
  erodeThin,
  modeColor,
  thinForeign,
  wallGradient
} from './blackbox.ts';

interface Rgb {
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

const WIDTH = 320;
const HEIGHT = 180;
const FLOOR: Rgb = { b: 244, g: 255, r: 231 };
const OWN: Rgb = { b: 152, g: 212, r: 136 };
/** The score bar, in the top left corner, as the game draws it at 1280x720 scaled down by four. */
const SCORE_BAR = { bottom: 10, right: 80, top: 3 };
const TERRITORY_RADIUS = 30;

function frame(paint: (x: number, y: number) => Rgb): ImageData {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const { b, g, r } = paint(x, y);
      const offset = (y * WIDTH + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { colorSpace: 'srgb', data, height: HEIGHT, width: WIDTH };
}

/**
 * A frame with the player's territory as a disc centred left of the player, so the nearest free floor is to the right.
 *
 * @param x - The column.
 * @param y - The row.
 * @returns The color.
 */
function homeFrame(x: number, y: number): Rgb {
  if (y >= SCORE_BAR.top && y < SCORE_BAR.bottom && x < SCORE_BAR.right) {
    return OWN;
  }
  return Math.hypot(x - (WIDTH / 2 - 10), y - HEIGHT / 2) < TERRITORY_RADIUS ? OWN : FLOOR;
}

/** A dark grey skin, like the bot that cut the trail unseen when greys were taken for text. */
const GREY: Rgb = { b: 64, g: 69, r: 74 };
const FOREIGN: Rgb = { b: 90, g: 110, r: 240 };
/** The leaderboard's left edge, as the pilot masks it, in pixels of the scaled-down frame. */
const LEADERBOARD_LEFT = 237;

/**
 * A grey trail, 4 pixels thick, running down the floor right of the player's territory.
 *
 * @param x - The column.
 * @param y - The row.
 * @returns Whether the pixel is on it.
 */
function isGreyTrail(x: number, y: number): boolean {
  return x >= WIDTH / 2 + 40 && x < WIDTH / 2 + 44 && y > 40 && y < 140;
}

/**
 * Foreign ground that runs under the leaderboard, of which only a 3-pixel sliver shows left of it.
 *
 * @param x - The column.
 * @param y - The row.
 * @returns Whether the pixel is on it.
 */
function isSliverBesideLeaderboard(x: number, y: number): boolean {
  return x >= LEADERBOARD_LEFT - 3 && y > 20 && y < 50;
}

describe('blackbox', () => {
  it('finds the most common color of a rectangle', () => {
    const image = frame(homeFrame);
    const own = modeColor(image, 0, SCORE_BAR.top, SCORE_BAR.right, SCORE_BAR.bottom);
    expect(Math.round(own.g)).toBe(OWN.g);
    const floor = modeColor(image, 0, 0, WIDTH, HEIGHT);
    expect(Math.round(floor.r)).toBe(FLOOR.r);
  });

  it('drops one-pixel lines and keeps thick areas', () => {
    const width = 8;
    const height = 8;
    const other = 3;
    const masked = 5;
    const classes = new Uint8Array(width * height);
    for (let x = 0; x < width; x++) {
      classes[2 * width + x] = other;
    }
    for (let y = 4; y < 7; y++) {
      for (let x = 2; x < 6; x++) {
        classes[y * width + x] = other;
      }
    }
    const cleaned = erodeThin(classes, width, height);
    expect(cleaned[2 * width + 3]).toBe(masked);
    expect(cleaned[5 * width + 3]).toBe(other);
  });

  it('measures the distance to the nearest marked pixel', () => {
    const width = 5;
    const marked = new Uint8Array(width * width);
    marked[2 * width + 2] = 1;
    const distances = chamferDistance(marked, width, width);
    expect(distances[2 * width + 2]).toBe(0);
    expect(distances[2 * width + 4]).toBe(2);
    expect(distances[0]).toBeCloseTo(2 * Math.SQRT2);
  });

  it('tells a trail joined to its territory from the territory', () => {
    const width = 60;
    const height = 40;
    const other = 3;
    const classes = new Uint8Array(width * height);
    // A territory 20 pixels square, and a trail 4 pixels thick leaving it to the right.
    for (let y = 10; y < 30; y++) {
      for (let x = 5; x < 25; x++) {
        classes[y * width + x] = other;
      }
    }
    for (let y = 18; y < 22; y++) {
      for (let x = 25; x < 55; x++) {
        classes[y * width + x] = other;
      }
    }
    const thin = thinForeign(classes, width, height);
    expect(thin[20 * width + 15]).toBe(0);
    expect(thin[20 * width + 40]).toBe(1);
  });

  it('points away from the wall', () => {
    const width = 10;
    const height = 6;
    // The outside lies to the right: the distance to it grows to the left.
    const wall = Float32Array.from({ length: width * height }, (_unused, index) => width - 1 - index % width);
    const away = wallGradient(wall, width, height, 5, 3);
    expect(away.x).toBeCloseTo(-1);
    expect(away.y).toBeCloseTo(0);
    expect(wallGradient(new Float32Array(width * height).fill(Infinity), width, height, 5, 3)).toEqual({ x: 0, y: 0 });
  });

  it('sees a grey unit as a danger', () => {
    const pilot = new BlackboxPilot();
    pilot.decide(frame((x, y) => isGreyTrail(x, y) ? GREY : homeFrame(x, y)));
    expect(pilot.debug.threat).not.toBeNull();
  });

  it('does not take foreign ground cut thin by the leaderboard for a unit', () => {
    const pilot = new BlackboxPilot();
    pilot.decide(frame((x, y) => isSliverBesideLeaderboard(x, y) ? FOREIGN : homeFrame(x, y)));
    expect(pilot.debug.threat).toBeNull();
  });

  it('remembers a danger that left the view', () => {
    const pilot = new BlackboxPilot();
    pilot.decide(frame((x, y) => isGreyTrail(x, y) ? GREY : homeFrame(x, y)));
    pilot.decide(frame(homeFrame));
    expect(pilot.debug.threat).not.toBeNull();
  });

  it('heads out of its territory toward the nearest free floor', () => {
    const pilot = new BlackboxPilot();
    const direction = pilot.decide(frame(homeFrame));
    expect(pilot.debug.phase).toBe('home');
    expect(direction).not.toBeNull();
    expect(direction?.x ?? 0).toBeGreaterThan(0);
  });
});
