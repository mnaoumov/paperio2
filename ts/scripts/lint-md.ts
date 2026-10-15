import { lint } from '@mnaoumov/typescript-dev-toolkit/linters/markdownlint';
import process from 'node:process';

const [, , ...paths] = process.argv;

await lint({ paths, shouldFix: false });
