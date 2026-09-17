#!/usr/bin/env node
import { execSync } from 'child_process';

try {
  console.log('Updating pnpm lockfile...');
  // Remove the frozen-lockfile constraint and update the lockfile
  execSync('pnpm install --no-frozen-lockfile', { stdio: 'inherit' });
  console.log('✓ Lockfile updated successfully');
} catch (error) {
  console.error('✗ Failed to update lockfile:', error.message);
  process.exit(1);
}
