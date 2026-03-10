#!/usr/bin/env node

const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const env = { ...process.env };

if (args.includes('--capacitor')) {
  env.CAPACITOR_BUILD = '1';
}

if (args.includes('--local')) {
  env.LOCAL_BUILD = '1';
}

function run(bin, binArgs) {
  const result = spawnSync(bin, binArgs, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npx', ['svelte-kit', 'sync']);
run('node', ['./node_modules/vite/bin/vite.js', 'build']);
