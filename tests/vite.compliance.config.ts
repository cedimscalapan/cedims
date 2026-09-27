import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    cacheDir: '.svelte-kit/compliance-vite-cache',
    plugins: [tailwindcss(), svelte({ configFile: false })],
    resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
