import { execSync } from 'child_process';

console.log('[v0] Regenerating pnpm-lock.yaml...');

try {
  execSync('pnpm install', {
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit'
  });
  console.log('[v0] Successfully regenerated pnpm-lock.yaml');
} catch (error) {
  console.error('[v0] Error regenerating lockfile:', error.message);
  process.exit(1);
}
