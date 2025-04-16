#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unlink } from 'node:fs/promises';

const readmeCopyTo = join(resolve('.'), 'packages/core/README.md');

const cleanup = async () =>
  existsSync(readmeCopyTo) &&
  (await unlink(readmeCopyTo)
    .then(() => console.log('Cleaned core README.md'))
    .catch(e => console.warn('Failed to clean README:', e.message)));

cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
