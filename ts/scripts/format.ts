import { format } from '@mnaoumov/typescript-dev-toolkit/formatters/dprint';
import process from 'node:process';

const [, , ...paths] = process.argv;

await format({ paths, rewrite: true });
