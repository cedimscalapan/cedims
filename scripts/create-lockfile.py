#!/usr/bin/env python3
import subprocess
import os
import sys

os.chdir('/vercel/share/v0-project')

try:
    # Run pnpm install without frozen-lockfile to generate a fresh lockfile
    result = subprocess.run(
        ['pnpm', 'install', '--no-frozen-lockfile'],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
    print("Return code:", result.returncode)
    
    if result.returncode == 0:
        print("✓ Successfully created fresh pnpm-lock.yaml")
    else:
        print("✗ Failed to create lockfile")
        sys.exit(1)
        
except subprocess.TimeoutExpired:
    print("✗ Command timed out")
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    sys.exit(1)
