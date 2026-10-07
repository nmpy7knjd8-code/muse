import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeKB } from '../src/core';
export const loadKB = (file: string) => normalizeKB(JSON.parse(readFileSync(resolve(process.cwd(), 'public', file), 'utf8')));
