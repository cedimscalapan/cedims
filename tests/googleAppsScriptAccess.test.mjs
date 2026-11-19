import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/google_apps_script.js', import.meta.url), 'utf8');

function createScript(sharedSecret) {
    const context = vm.createContext({
        PropertiesService: {
            getScriptProperties: () => ({ getProperty: () => sharedSecret })
        },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput: (text) => ({ text, setMimeType() { return this; } })
        }
    });
    vm.runInContext(source, context);
    let conversions = 0;
    let exports = 0;
    context.convertDocToPdf_ = () => { conversions++; return { text: '{"success":true}' }; };
    context.exportComplianceReport = () => { exports++; return 1; };
    const post = (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
    return { post, counts: () => ({ conversions, exports }) };
}

test('Google web app rejects requests without its configured shared secret', () => {
    const missingConfiguration = createScript(null);
    assert.equal(missingConfiguration.post({ sharedSecret: 'guess', fileName: 'a.docx' }).error, 'Unauthorized');

    const script = createScript('server-only-secret');
    assert.equal(script.post({ fileName: 'a.docx' }).error, 'Unauthorized');
    assert.equal(script.post({ sharedSecret: 'wrong', fileName: 'a.docx' }).error, 'Unauthorized');
    assert.deepEqual(script.counts(), { conversions: 0, exports: 0 });
});

test('HTTP requests cannot trigger report export', () => {
    const script = createScript('server-only-secret');
    assert.equal(script.post({ sharedSecret: 'server-only-secret', action: 'export_report' }).error, 'Unsupported action');
    assert.deepEqual(script.counts(), { conversions: 0, exports: 0 });
    assert.equal(script.post({ sharedSecret: 'server-only-secret', fileName: 'a.docx' }).success, true);
    assert.deepEqual(script.counts(), { conversions: 1, exports: 0 });
});
