#!/usr/bin/env python3
import subprocess
import sys
import os

os.chdir('/vercel/share/v0-project')

print('[v0] Starting pnpm install with updated dependencies...')

try:
    result = subprocess.run([
        'pnpm', 'install', '--no-frozen-lockfile'
    ], check=True)
    print('[v0] Dependencies installed successfully!')
    sys.exit(0)
except subprocess.CalledProcessError as e:
    print(f'[v0] Installation failed: {e}')
    sys.exit(1)
except FileNotFoundError:
    print('[v0] pnpm not found in PATH, using npm instead...')
    try:
        result = subprocess.run([
            'npm', 'install'
        ], check=True)
        print('[v0] Dependencies installed with npm!')
    except Exception as e2:
        print(f'[v0] npm install also failed: {e2}')
        sys.exit(1)
