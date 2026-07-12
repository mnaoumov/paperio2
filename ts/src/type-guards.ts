/**
 * @file
 *
 * Minimal null-safety assertion helpers, mirroring the API of
 * `obsidian-dev-utils`'s `type-guards` module (not a dependency of this
 * browser bundle, so the two functions are replicated here). Used throughout
 * the deobfuscated engine to make "this value is set by now" invariants
 * explicit and testable instead of reaching for the banned `!` operator.
 */

/**
 * Constrains {@link assertNonNullable} / {@link ensureNonNullable} so they are
 * only callable when `T` actually includes `null` or `undefined`. Passing an
 * already non-nullable value is a compile error, which prevents dead asserts.
 *
 * @typeParam T - The type being constrained.
 */
type NullableConstraint<T> = null extends T ? unknown : undefined extends T ? unknown : never;

/**
 * Asserts that a value is not `null` or `undefined`, narrowing its type in place.
 *
 * Only callable when `T` includes `null` or `undefined`. Passing an already non-nullable type is a compile error.
 *
 * @typeParam T - The type of the value.
 * @param value - The value to check.
 * @param errorOrMessage - Optional {@link Error} or error message string.
 * @throws If the value is `null` or `undefined`.
 */
export function assertNonNullable<T extends NullableConstraint<T>>(value: T, errorOrMessage?: Error | string): asserts value is NonNullable<T> {
  if (value !== null && value !== undefined) {
    return;
  }

  errorOrMessage ??= value === null ? 'Value is null' : 'Value is undefined';
  const error = typeof errorOrMessage === 'string' ? new Error(errorOrMessage) : errorOrMessage;
  throw error;
}

/**
 * Ensures that a value is not `null` or `undefined` and returns it with narrowed type.
 *
 * Only callable when `T` includes `null` or `undefined`. Passing an already non-nullable type is a compile error.
 *
 * @typeParam T - The type of the value.
 * @param value - The value to check.
 * @param errorOrMessage - Optional {@link Error} or error message string.
 * @returns The value with `null` and `undefined` excluded from its type.
 * @throws If the value is `null` or `undefined`.
 */
export function ensureNonNullable<T extends NullableConstraint<T>>(value: T, errorOrMessage?: Error | string): NonNullable<T> {
  assertNonNullable(value, errorOrMessage);
  return value;
}
