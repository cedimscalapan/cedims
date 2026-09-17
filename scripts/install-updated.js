import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

console.log('[v0] Starting pnpm install with updated dependencies...');

try {
  execSync('pnpm install --no-frozen-lockfile', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('[v0] Dependencies installed successfully!');
} catch (error) {
  console.error('[v0] Installation failed:', error.message);
  process.exit(1);
}
