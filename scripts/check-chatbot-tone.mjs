import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true } });
try {
    const { processQuery } = await server.ssrLoadModule('/src/lib/utils/chatbot.ts');
    for (const query of ['hello', 'kumusta po', 'salamat po', 'thank you', 'How do I upload a DLL?']) {
        // Exercise the random response variants as well as intent dispatch.
        for (let attempt = 0; attempt < 12; attempt++) {
            const response = await processQuery(query);
            assert.doesNotMatch(response.answer, /\b(Hoy|Hey there|Sure thing|On it|Anytime)\b/i);
            assert.ok(!response.outOfScope, query);
            if (query === 'salamat po') assert.match(response.answer, /po/);
        }
    }
    const database = new Proxy({}, { get() { throw new Error('Unsupported request reached the database'); } });
    const response = await processQuery('What is the weather today?', { supabase: database });
    assert.equal(response.outOfScope, true);
    assert.match(response.answer, /outside my CEDIMS support scope/);
    assert.deepEqual(response.attachments, undefined);
    console.log('Passed: professional greetings, thanks, upload guidance, and scope fallback.');
} finally {
    await server.close();
}
