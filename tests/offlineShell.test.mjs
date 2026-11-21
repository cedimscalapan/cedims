import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('an installed app opens Upload directly while offline without caching account data', async () => {
    const handlers = new Map();
    const cacheRows = new Map();
    let online = true;
    class FakeResponse {
        constructor(body, options = {}, url = '') {
            this.body = body;
            this.status = options.status || 200;
            this.ok = this.status >= 200 && this.status < 300;
            this.type = 'basic';
            this.url = url;
        }
        clone() { return new FakeResponse(this.body, { status: this.status }, this.url); }
    }
    const cache = {
        put: async (key, value) => { cacheRows.set(typeof key === 'string' ? key : new URL(key.url).pathname, value); },
        match: async key => cacheRows.get(typeof key === 'string' ? key : new URL(key.url).pathname),
    };
    const self = {
        location: { origin: 'https://cedims.test' },
        addEventListener: (name, handler) => handlers.set(name, handler),
        clients: { claim: async () => {} },
    };
    const source = ts.transpileModule(readFileSync('src/service-worker.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, {
        self, Response: FakeResponse, URL, setTimeout,
        console: { warn() {}, error() {} },
        caches: { open: async () => cache, keys: async () => ['cache-test'], delete: async () => {} },
        fetch: async input => {
            if (!online) throw new Error('offline');
            const url = new URL(typeof input === 'string' ? input : input.url, self.location.origin);
            return new FakeResponse(url.pathname, {}, url.href);
        },
        require: name => name === '$service-worker'
            ? { build: ['/_app/start.js'], files: ['/manifest.json', '/school-photo.jpg'], version: 'test' }
            : { PDFJS_VERSION: '4.0.0' },
        exports: {},
    });
    let installation;
    handlers.get('install')({ waitUntil: promise => { installation = promise; } });
    await installation;
    assert.equal(cacheRows.has('/dashboard/upload'), true);
    assert.equal(cacheRows.has('/school-photo.jpg'), false);
    online = false;
    let navigation;
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://cedims.test/dashboard/upload' }, respondWith: promise => { navigation = promise; } });
    const response = await navigation;
    assert.equal(response.body, '/dashboard/upload');
    assert.equal(response.status, 200);
    let intercepted = false;
    handlers.get('fetch')({ request: { method: 'GET', mode: 'navigate', url: 'https://cedims.test/api/private' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
});
