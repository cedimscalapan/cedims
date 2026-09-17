#!/usr/bin/env node
const { execSync } = require('child_process');

try {
  console.log('Running pnpm install without frozen-lockfile...');
  execSync('pnpm install --no-frozen-lockfile', {
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit'
  });
  console.log('✓ Successfully created fresh pnpm-lock.yaml');
} catch (error) {
  console.error('✗ Error:', error.message);
  process.exit(1);
}
