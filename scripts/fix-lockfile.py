import subprocess
import os

os.chdir('/vercel/share/v0-project')

print('[v0] Regenerating pnpm-lock.yaml...')

try:
    result = subprocess.run(['pnpm', 'install'], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print('[v0] Error:', result.stderr)
    else:
        print('[v0] Successfully regenerated pnpm-lock.yaml')
except Exception as e:
    print(f'[v0] Error: {str(e)}')
