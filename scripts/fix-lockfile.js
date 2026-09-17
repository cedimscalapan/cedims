import { execSync } from 'child_process';

try {
  console.log('Regenerating pnpm-lock.yaml...');
  execSync('pnpm install --no-frozen-lockfile', {
    cwd: '/vercel/share/v0-project',
    stdio: 'inherit'
  });
  console.log('✓ pnpm-lock.yaml has been regenerated successfully!');
} catch (error) {
  console.error('Error regenerating lockfile:', error.message);
  process.exit(1);
}
