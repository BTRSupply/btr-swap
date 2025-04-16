#!/usr/bin/env bun
import dts from 'bun-plugin-dts';
import { join, resolve } from 'node:path';
import { copyFile, rm } from 'node:fs/promises';

const root = resolve('.');
const packages = {
  core: {
    src: pkg => `packages/${pkg}/src/index.ts`,
    dist: pkg => `packages/${pkg}/dist`,
    buildOptions: { target: 'bun', format: 'esm', plugins: [dts({})] }
  },
  cli: {
    src: () => 'packages/cli/src/cli.ts',
    dist: pkg => `packages/${pkg}/dist`,
    buildOptions: { target: 'node', format: 'esm', external: ['@btr-supply/swap'] }
  }
};

const build = async pkg => {
  console.log(`Building ${pkg}...`);
  const { src, dist, buildOptions } = packages[pkg];
  await rm(join(root, dist(pkg)), { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: [join(root, src(pkg))],
    outdir: join(root, dist(pkg)),
    sourcemap: 'none',
    ...buildOptions
  });

  if (!result.success) {
    console.error(`Build failed for ${pkg}:`, ...result.logs);
    process.exit(1);
  }
};

const readmeCopyTo = join(root, 'packages/core/README.md');

try {
  await build('core');
  await copyFile(join(root, 'README.md'), readmeCopyTo);
  await build('cli');
  console.log('Build complete');
} catch (e) {
  console.error('Build error:', e);
  process.exit(1);
}
