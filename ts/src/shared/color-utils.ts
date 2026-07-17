import type {
  Hsv,
  Rgb
} from './types.ts';

import {
  HEX_CHANNEL_DIGITS,
  HEX_RADIX,
  PERCENT_MAX,
  RGB_CHANNEL_MAX
} from './constants.ts';

const HUE_DEGREES_MAX = 360;
const HSV_SECTOR_DEGREES = 60;
const HSV_SECTOR_COUNT = 6;

export function brighten(hsv: Hsv, factor: number): Hsv {
  const {
    h,
    s,
    v
  } = hsv;
  const headroom = PERCENT_MAX - v;
  // eslint-disable-next-line no-magic-numbers -- brighten adds up to a quarter of the remaining headroom.
  const brightenedValue = Math.max(v * factor, v + factor * headroom / 4);
  return {
    h,
    s,
    v: brightenedValue
  };
}

export function hexToRgb(hex: string): Rgb {
  // eslint-disable-next-line no-magic-numbers -- #RRGGBB: the red channel is chars 1-3.
  const red = parseInt(hex.substring(1, 3), HEX_RADIX);
  // eslint-disable-next-line no-magic-numbers -- #RRGGBB: the green channel is chars 3-5.
  const green = parseInt(hex.substring(3, 5), HEX_RADIX);
  // eslint-disable-next-line no-magic-numbers -- #RRGGBB: the blue channel is chars 5-7.
  const blue = parseInt(hex.substring(5, 7), HEX_RADIX);
  return {
    b: blue,
    g: green,
    r: red
  };
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hsvToRgb({
  h,
  s,
  v
}: Hsv): Rgb {
  h = Math.max(0, Math.min(HUE_DEGREES_MAX, h));
  s = Math.max(0, Math.min(PERCENT_MAX, s)) / PERCENT_MAX;
  v = Math.max(0, Math.min(PERCENT_MAX, v)) / PERCENT_MAX;
  let red;
  let green;
  let blue;
  if (s === 0) {
    red = v;
    green = v;
    blue = v;
  } else {
    h /= HSV_SECTOR_DEGREES;
    const sector = Math.floor(h);
    const fraction = h - sector;
    const p = v * (1 - s);
    const q = v * (1 - s * fraction);
    const t = v * (1 - s * (1 - fraction));
    switch (sector) {
      case 0:
        red = v;
        green = t;
        blue = p;
        break;
      case 1:
        red = q;
        green = v;
        blue = p;
        break;
      // eslint-disable-next-line no-magic-numbers -- HSV hue sector index.
      case 2:
        red = p;
        green = v;
        blue = t;
        break;
      // eslint-disable-next-line no-magic-numbers -- HSV hue sector index.
      case 3:
        red = p;
        green = q;
        blue = v;
        break;
      // eslint-disable-next-line no-magic-numbers -- HSV hue sector index.
      case 4:
        red = t;
        green = p;
        blue = v;
        break;
      default:
        red = v;
        green = p;
        blue = q;
    }
  }
  return {
    b: Math.round(blue * RGB_CHANNEL_MAX),
    g: Math.round(green * RGB_CHANNEL_MAX),
    r: Math.round(red * RGB_CHANNEL_MAX)
  };
}

export function rgbToHex({
  b,
  g,
  r
}: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
  function channelToHex(channel: number): string {
    const hex = channel.toString(HEX_RADIX);
    if (hex.length < HEX_CHANNEL_DIGITS) {
      return `0${hex}`;
    }
    return hex;
  }
}

export function rgbToHsv({
  b,
  g,
  r
}: Rgb): Hsv {
  const normRed = r / RGB_CHANNEL_MAX;
  const normGreen = g / RGB_CHANNEL_MAX;
  const normBlue = b / RGB_CHANNEL_MAX;
  const max = Math.max(normRed, normGreen, normBlue);
  const delta = max - Math.min(normRed, normGreen, normBlue);
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / max;
    const redHueComponent = computeHueComponent(normRed);
    const greenHueComponent = computeHueComponent(normGreen);
    const blueHueComponent = computeHueComponent(normBlue);
    if (normRed === max) {
      hue = blueHueComponent - greenHueComponent;
    } else if (normGreen === max) {
      // eslint-disable-next-line no-magic-numbers -- green-max hue starts 1/3 of the way around the wheel.
      hue = 1 / 3 + redHueComponent - blueHueComponent;
    } else if (normBlue === max) {
      // eslint-disable-next-line no-magic-numbers -- blue-max hue starts 2/3 of the way around the wheel.
      hue = 2 / 3 + greenHueComponent - redHueComponent;
    }
    if (hue < 0) {
      hue += 1;
    } else if (hue > 1) {
      hue -= 1;
    }
  }
  return {
    h: Math.round(hue * HUE_DEGREES_MAX),
    s: round2(saturation * PERCENT_MAX),
    v: round2(max * PERCENT_MAX)
  };
  function computeHueComponent(channelValue: number): number {
    // eslint-disable-next-line no-magic-numbers -- HSV hue-component interpolation: the 1/2 phase offset.
    return (max - channelValue) / HSV_SECTOR_COUNT / delta + 1 / 2;
  }
  function round2(value: number): number {
    // eslint-disable-next-line no-magic-numbers -- round to 2 decimal places (10^2).
    return Math.round(value * 100) / 100;
  }
}

export function scaleValue(hsv: Hsv, factor: number): Hsv {
  const {
    h,
    s,
    v
  } = hsv;
  return {
    h,
    s,
    v: v * factor
  };
}

export function setValue(hsv: Hsv, value: number): Hsv {
  const {
    h,
    s
  } = hsv;
  return {
    h,
    s,
    v: value
  };
}
