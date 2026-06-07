#!/usr/bin/env node
// Writes the semantic-release-computed version into the workspace source
// package.json files so the repository (and any build artifact produced from
// it) reflects the released version instead of being stuck at the seed value.
//
// Invoked by @semantic-release/exec during `prepare`:
//   node scripts/sync-version.mjs ${nextRelease.version}
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];

if (!version) {
  console.error('Usage: sync-version.mjs <version>');
  process.exit(1);
}

const files = ['package.json', 'projects/angular-inline-svg/package.json'];

for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Set ${file} version -> ${version}`);
}
