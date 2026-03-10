#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'static');
const MAX_BYTES = 25 * 1024 * 1024;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, out);
      continue;
    }
    if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function main() {
  const files = walk(STATIC_DIR);
  const oversized = files
    .map((file) => ({ file, size: fs.statSync(file).size }))
    .filter((entry) => entry.size > MAX_BYTES);

  if (oversized.length === 0) {
    process.stdout.write(`Static asset check passed. Largest allowed size is ${formatMiB(MAX_BYTES)}.\n`);
    return;
  }

  for (const entry of oversized) {
    process.stderr.write(
      `Oversized static asset: ${path.relative(ROOT, entry.file)} (${formatMiB(entry.size)})\n`
    );
  }
  process.exit(1);
}

main();
