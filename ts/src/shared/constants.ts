// eslint-disable-next-line no-magic-numbers -- EPSILON is 2^-26, the engine's fixed geometric tolerance.
export const EPSILON = 2 ** -26;
export const RGB_CHANNEL_MAX = 255;
export const PERCENT_MAX = 100;
export const HEX_RADIX = 16;
export const HEX_CHANNEL_DIGITS = 2;
export const FIXED_DECIMAL_DIGITS = 2;
export const MILLISECONDS_IN_SECOND = 1000;
export const IMAGE_CENTER_DIVISOR = 2;
// eslint-disable-next-line no-magic-numbers -- 90° in radians.
export const QUARTER_TURN = Math.PI / 2;
// eslint-disable-next-line no-magic-numbers -- 45° in radians.
export const EIGHTH_TURN = Math.PI / 4;
// eslint-disable-next-line no-magic-numbers -- 22.5° in radians.
export const SIXTEENTH_TURN = Math.PI / 8;
// eslint-disable-next-line no-magic-numbers -- a full turn is 2π radians (circumference = 2πr).
export const FULL_TURN = Math.PI * 2;
