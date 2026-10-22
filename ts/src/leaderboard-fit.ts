const ELLIPSIS = '…';
const SIDE_MARGIN_COUNT = 2;
const HALF_DIVISOR = 2;

export interface LeaderboardRowFit {
  /** The bar's left edge, moved left of the original's when the label needs the room. */
  readonly barX: number;
  /** The row's text, with the name cut short by an ellipsis only when it cannot fit even at the widest position. */
  readonly label: string;
}

export interface LeaderboardRowFitInput {
  /** The bar's width, which is also the widest the leaderboard may get: the top bar's span from the right edge. */
  readonly barWidth: number;
  /** The bar's left edge as the original places it: further right the lower the row's score. */
  readonly barX: number;
  /** The text's margin from the bar's left end (after the flag), kept as its margin from the right edge too. */
  readonly halfBarHeight: number;
  /** The flag's width before the text, or 0 when the row has no flag. */
  readonly iconWidth: number;
  /** The rendered width of a text in the leaderboard's font. */
  readonly measure: (text: string) => number;
  readonly name: string;
  /** The rank and percent before the name, which are never shortened. */
  readonly prefix: string;
  /** The viewport's right edge, in the same units as `barX`. */
  readonly rightEdge: number;
}

/**
 * Lays out one leaderboard row so its text ends inside the viewport.
 *
 * The original staggers the bars (each starts further right the lower its score) and lets them run off the right
 * edge, which clips the names, the player's own row worst. This keeps the stagger wherever the text already fits,
 * moves a bar left just enough where it does not, never further left than the top bar, and cuts the name short with
 * an ellipsis only when it does not fit even there.
 *
 * @param input - The row's original position, its text and the leaderboard's dimensions.
 * @returns The bar's left edge and the text to draw.
 */
export function fitLeaderboardRow(input: LeaderboardRowFitInput): LeaderboardRowFit {
  const { barWidth, halfBarHeight, iconWidth, measure, name, prefix, rightEdge } = input;
  const chrome = iconWidth + halfBarHeight * SIDE_MARGIN_COUNT;
  const maxTextWidth = barWidth - chrome;
  let label = prefix + name;
  if (measure(label) > maxTextWidth) {
    label = truncateName(prefix, name, maxTextWidth, measure);
  }
  const fittedX = rightEdge - chrome - measure(label);
  const barX = Math.max(rightEdge - barWidth, Math.min(input.barX, fittedX));
  return { barX, label };
}

function truncateName(prefix: string, name: string, maxWidth: number, measure: (text: string) => number): string {
  const characters = Array.from(name);
  let low = 0;
  let high = characters.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / HALF_DIVISOR);
    if (measure(withEllipsis(prefix, characters, middle)) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return withEllipsis(prefix, characters, low);
}

function withEllipsis(prefix: string, characters: readonly string[], count: number): string {
  return `${prefix}${characters.slice(0, count).join('').trimEnd()}${ELLIPSIS}`;
}
