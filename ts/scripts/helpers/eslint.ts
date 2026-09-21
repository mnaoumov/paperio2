import type { ExecResult } from './exec.ts';

import { execFromRoot } from './root.ts';

/**
 * ESLint's exit-code contract: `0` is clean, `1` means it finished and reported lint problems, and every other
 * code means it never finished linting at all - a rule threw, the config is broken, or the OS killed the
 * process. Only `1` is evidence about the source; the rest are evidence about the linter, and a caller that
 * reads them as findings goes hunting for a defect that is not there.
 *
 * @see {@link https://eslint.org/docs/latest/use/command-line-interface#exit-codes}
 */
const ESLINT_EXIT_CODE_CLEAN = 0;

const ESLINT_EXIT_CODE_LINT_PROBLEMS = 1;

/**
 * The banner ESLint's fatal-error handler writes to stderr before exiting. It is NOT crash-specific: ESLint
 * prints it for a mistyped path and a broken config just as readily as for a rule that threw, so it answers
 * "ESLint threw instead of finishing" and nothing finer. {@link RULE_CRASH_REG_EXP} is what separates the
 * rule crash out of that set.
 */
const ESLINT_ABORT_BANNER = 'Oops! Something went wrong!';

/** ESLint names the offending rule on its own line, and only when a RULE is what threw. */
const RULE_CRASH_REG_EXP = /^Rule: "/m;

/** The npm chatter that shares the child's stderr and says nothing about why the lint failed. */
const NPM_NOTICE_PREFIX = 'npm notice';

/** A stack frame in ESLint's own output - the lines above it say what happened, these say only where. */
const STACK_FRAME_REG_EXP = /^at\s/;

const MAX_FAILURE_DETAIL_LINES = 6;

/**
 * Exit codes at or above this are Windows NT status values rather than ordinary process exit codes - notably
 * `3221225477` (`0xC0000005`, an access violation). The ESLint child really does die that way on Windows
 * (measured at 1 run in 30 on the machine this was written on, on an unchanged, lint-clean tree), and npm
 * then reports it to its own caller as a plain exit `1` - which is indistinguishable from "the code is red"
 * unless something says otherwise. That is what {@link describeFailureToLint} is for.
 */
const MIN_NT_STATUS_EXIT_CODE = 0x1_00_00;

const HEX_RADIX = 16;

/**
 * What an ESLint run actually established.
 *
 * - `clean` - it linted everything and found nothing.
 * - `lint-problems` - it linted everything and the SOURCE is red.
 * - `did-not-lint` - it never got through the lint, so the source has not been judged at all.
 */
export type EslintExitKind = 'clean' | 'did-not-lint' | 'lint-problems';

/** The message thrown for real findings, kept apart from {@link describeFailureToLint}'s. */
export const LINT_PROBLEMS_MESSAGE = 'ESLint reported lint problems. The findings are printed above.';

interface LintOptions {
  readonly paths?: string[] | undefined;
  readonly shouldFix?: boolean | undefined;
}

export function classifyEslintExit(result: ExecResult): EslintExitKind {
  if (result.exitCode === ESLINT_EXIT_CODE_CLEAN && result.exitSignal === null) {
    return 'clean';
  }

  if (result.exitCode === ESLINT_EXIT_CODE_LINT_PROBLEMS && !result.stderr.includes(ESLINT_ABORT_BANNER)) {
    return 'lint-problems';
  }

  return 'did-not-lint';
}

export function describeFailureToLint(result: ExecResult): string {
  const lines = [
    getFailureHeadline(result),
    'This is NOT a lint finding: the source code has not been judged, so do not go looking for a defect in it.',
    'Re-run the command. Only if it reproduces is there something to fix, and the thing to fix is the linter.',
    `  exit code: ${formatExitCode(result.exitCode)}`
  ];

  if (result.exitSignal !== null) {
    lines.push(`  terminated by signal: ${result.exitSignal}`);
  }

  const details = extractFailureDetails(result.stderr);
  lines.push(details.length > 0 ? '  ESLint said:' : '  ESLint printed no diagnostic at all.', ...details.map((detail) => `    ${detail}`));

  return lines.join('\n');
}

export async function lint(options: LintOptions = {}): Promise<void> {
  const targets = options.paths?.length ? options.paths : ['.'];
  const result = await execFromRoot(['npx', 'eslint', ...(options.shouldFix ? ['--fix'] : []), { batchedArgs: targets }], {
    shouldIgnoreExitCode: true,
    shouldIncludeDetails: true
  });

  const kind = classifyEslintExit(result);

  if (kind === 'clean') {
    return;
  }

  throw new Error(kind === 'lint-problems' ? LINT_PROBLEMS_MESSAGE : describeFailureToLint(result));
}

/*
 * Quotes back everything ESLint said that carries information, rather than matching a list of known
 * prefixes: the first attempt listed `ESLint:` / `Occurred while linting` / `Rule:`, which covered the rule
 * crash it was written from and dropped the one line that mattered for a mistyped path
 * (`No files matching the pattern ...`). Subtracting the noise is the smaller and more durable claim, so
 * this drops only the banner itself, npm's chatter and the stack frames, and keeps whatever is left.
 */
function extractFailureDetails(stderr: string): string[] {
  const details: string[] = [];

  for (const rawLine of stderr.split('\n')) {
    if (details.length === MAX_FAILURE_DETAIL_LINES) {
      break;
    }

    const line = rawLine.trim();
    const isNoise = line === ''
      || line.startsWith(ESLINT_ABORT_BANNER)
      || line.startsWith(NPM_NOTICE_PREFIX)
      || STACK_FRAME_REG_EXP.test(line);
    if (!isNoise && !details.includes(line)) {
      details.push(line);
    }
  }

  return details;
}

function formatExitCode(exitCode: null | number): string {
  if (exitCode === null) {
    return '(none - the process was terminated before it could exit)';
  }

  if (exitCode < MIN_NT_STATUS_EXIT_CODE) {
    return String(exitCode);
  }

  return `${String(exitCode)} (0x${exitCode.toString(HEX_RADIX).toUpperCase()})`;
}

function getFailureHeadline(result: ExecResult): string {
  if (result.exitSignal !== null) {
    return 'ESLint was KILLED before it finished linting.';
  }

  if (result.exitCode !== null && result.exitCode >= MIN_NT_STATUS_EXIT_CODE) {
    return 'ESLint DIED at the OS level - an access violation or similar, with no diagnostic of its own.';
  }

  if (RULE_CRASH_REG_EXP.test(result.stderr)) {
    return 'ESLint CRASHED: a rule threw while linting. The rule and the file it was on are named below.';
  }

  if (result.stderr.includes(ESLINT_ABORT_BANNER)) {
    return 'ESLint ABORTED: it threw instead of finishing - a broken config or command line, or an internal error.';
  }

  return 'ESLint exited non-zero without reporting findings, so it did not finish linting.';
}
