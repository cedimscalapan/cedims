import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const url = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions }).outputText).toString('base64')}`;
const rulesUrl = url(readFileSync('src/lib/utils/uploadQueueRules.ts', 'utf8'));
const duplicatesUrl = url(readFileSync('src/lib/utils/submissionDuplicates.ts', 'utf8'));
const rules = await import(rulesUrl);
const { DuplicateUploadError } = await import(duplicatesUrl);

const stubs = `
const S = globalThis.__queueStubs;
const get = async key => S.idb.get(key);
const set = async (key, value) => { S.idb.set(key, value); };
const del = async key => { S.idb.delete(key); };
const keys = async () => [...S.idb.keys()].sort();
const writable = value => { const store = { value, set(next) { store.value = next; }, update(fn) { store.value = fn(store.value); }, subscribe() { return () => {}; } }; return store; };
const supabase = new Proxy({}, { get: (_, key) => S.supabase[key] });
const withTimeout = promise => Promise.resolve(promise);
const xhrUpload = (...args) => S.xhrUpload(...args);
const getCurrentSchoolYear = () => '2026-2027';
const deadlineAtTenAM = value => new Date(value);
const effectiveDeadlineForSubject = value => new Date(value);
const logAudit = async () => {};
const logOnce = () => {};
const isWeeklyComplianceDocType = doc => doc === 'DLL' || doc === 'DLP';
const addToast = (type, message) => S.toasts.push({ type, message });
`;
let source = readFileSync('src/lib/utils/offline.ts', 'utf8')
    .replace("import { assertNoDatabaseDuplicate, DuplicateUploadError } from './submissionDuplicates';", `import { assertNoDatabaseDuplicate, DuplicateUploadError } from '${duplicatesUrl}';`)
    .replace("import { classifyQueueFailure, httpUploadFailure, nextAttemptDelay, QUEUE_RETRY_MS, shouldCancelAfter, UploadRejectedError } from './uploadQueueRules';", `import { classifyQueueFailure, httpUploadFailure, nextAttemptDelay, QUEUE_RETRY_MS, shouldCancelAfter, UploadRejectedError } from '${rulesUrl}';`)
    .replace("const { updateAppBadge } = await import('./badge');\n    await updateAppBadge();", '')
    .replace("const { updateAppBadge } = await import('./badge');\r\n    await updateAppBadge();", '');
source = source.split(/\r?\n/).filter(line => !/^import .* from '/.test(line) || line.includes('data:text/javascript')).join('\n');
const S = globalThis.__queueStubs = { idb: new Map(), toasts: [], supabase: null, xhrUpload: null };
const queue = await import(url(stubs + source));

const KEY = 'sync_queue_100_abcdef12';
function makeItem(extra = {}) {
    return { fileName: 'WEEK 7 TERM 2 MATH G6.pdf', filePath: 'submissions/t/DLL/Term_2/a.pdf', fileHash: 'abcdef1234', contentHash: 'contents', fileSize: 10, pdfBytes: new Blob(['x']),
        options: { userId: 't', docType: 'DLL', termNumber: 2, weekNumber: 7, schoolYear: '2026-2027', subject: 'Mathematics', teachingLoadId: 'math6', calendarId: 'cal', schoolName: 'Ibaba ES' }, timestamp: 100, ...extra };
}
// Answers each table by name; a test overrides only the row it is about.
function database(answers = {}) {
    const inserts = [];
    const db = {
        inserts,
        auth: { getSession: async () => ({ data: { session: 'session' in answers ? answers.session : { access_token: 'token', user: { id: 't' } } } }) },
        from(table) {
            const query = {
                filters: {},
                select() { return query; }, eq(k, v) { query.filters[k] = v; return query; }, neq() { return query; }, in() { return query; },
                limit() { return query; }, is() { return query; },
                maybeSingle() { return query; }, single() { return query; },
                insert(row) { inserts.push(row); return Promise.resolve(answers.insert ? answers.insert() : { error: null }); },
                then(resolve, reject) {
                    const answer = answers[table] ? answers[table](query.filters) : { data: table === 'academic_calendar' ? { id: 'cal', deadline_date: '2026-11-02T02:00:00Z' } : table === 'profiles' ? { district_id: 'd', school_id: 's' } : null, error: null };
                    return Promise.resolve(answer).then(resolve, reject);
                },
            };
            return query;
        },
    };
    return db;
}
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = { location: { origin: 'http://app.test' }, dispatchEvent(event) { events.push(event); } };
let events = [];
let reachable = true;
globalThis.fetch = async () => { if (!reachable) throw new Error('offline'); return { ok: true, status: 200 }; };
const okUpload = async () => ({ ok: true, status: 200, body: '{}' });

beforeEach(() => {
    S.idb.clear(); S.toasts.length = 0; events = []; reachable = true;
    S.supabase = database(); S.xhrUpload = okUpload;
    navigator.onLine = true;
    queue.failedUploads.set([]);
});
const notices = () => [...S.idb.keys()].filter(key => key.startsWith('sync_failed_'));

test('offline uploads stop at a small device storage limit without dropping earlier files', async () => {
    for (let i = 0; i < 5; i++) {
        await queue.enqueue(makeItem({ timestamp: 100 + i, fileSize: 4 * 1024 * 1024 }));
    }
    await assert.rejects(queue.enqueue(makeItem({ timestamp: 106, fileSize: 1 })), /20 MB/);
    assert.equal(await queue.getQueueSize(), 5);
});

test('a queued file uploads by itself and leaves the queue', async () => {
    S.idb.set(KEY, makeItem());
    assert.deepEqual(await queue.processQueue(), { success: 1, failed: 0 });
    assert.equal(S.idb.has(KEY), false);
    assert.equal(S.supabase.inserts[0].teaching_load_id, 'math6');
    assert.equal(notices().length, 0);
});

test('a term and week Closed by the server cancels the upload and tells the teacher to redo it', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ academic_calendar: () => ({ data: null, error: null }) });
    S.xhrUpload = async () => assert.fail('nothing is sent to a Closed week');
    assert.deepEqual(await queue.processQueue(), { success: 0, failed: 1 });
    assert.equal(S.idb.has(KEY), false);
    const notice = S.idb.get(notices()[0]);
    assert.match(notice.reason, /Term 2, Week 7 is Closed/);
    assert.equal(notice.canRedo, true);
    assert.equal(notice.redoHref, '/dashboard/upload?load=math6&term=2&week=7');
    assert.match(S.toasts[0].message, /WEEK 7 TERM 2 MATH G6\.pdf was not uploaded.*Please upload it again/);
    assert.equal(events[0].detail.fileHash, 'abcdef1234');
});

test('a server refusal cancels on the first try', async () => {
    S.idb.set(KEY, makeItem());
    S.xhrUpload = async () => ({ ok: false, status: 413, body: JSON.stringify({ message: 'File exceeds the 4MB upload limit.' }) });
    await queue.processQueue();
    assert.equal(S.idb.has(KEY), false);
    assert.match(S.idb.get(notices()[0]).reason, /413.*4MB/);
});

test('a refused database record cancels instead of retrying forever', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ insert: () => ({ error: { code: 'P0001', message: 'Select an active assigned teaching load.' } }) });
    await queue.processQueue();
    assert.equal(S.idb.has(KEY), false);
    assert.match(S.idb.get(notices()[0]).reason, /active assigned teaching load/);
});

test('a duplicate names where the file already is and does not ask for the same upload', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ submissions: filters => filters.content_hash
        ? { data: [{ id: 'x', term_number: 2, week_number: 7, teaching_loads: { subject: 'Mathematics', grade_level: 'Grade 5' } }], error: null }
        : { data: null, error: null } });
    await queue.processQueue();
    const notice = S.idb.get(notices()[0]);
    assert.match(notice.reason, /Mathematics · Grade 5 · Term 2, Week 7/);
    assert.equal(notice.canRedo, false);
});

test('no internet keeps the file safe and is not counted as a failure', async () => {
    S.idb.set(KEY, makeItem());
    navigator.onLine = false;
    await queue.processQueue();
    assert.equal(S.idb.get(KEY).attempts, undefined);
    navigator.onLine = true;
    reachable = false;
    await queue.processQueue();
    assert.equal(S.idb.get(KEY).attempts, undefined);
    assert.equal(notices().length, 0);
});

test('a connection that drops mid-transfer waits without counting against the file', async () => {
    S.idb.set(KEY, makeItem());
    S.xhrUpload = async () => { reachable = false; throw new Error('Network error during upload.'); };
    await queue.processQueue();
    assert.ok(S.idb.has(KEY));
    assert.equal(S.idb.get(KEY).attempts, undefined);
});

test('repeated failures with working internet back off, then cancel with a redo message', async () => {
    S.idb.set(KEY, makeItem());
    S.xhrUpload = async () => { throw new Error('Upload stalled — no data sent for a while.'); };
    for (let attempt = 1; attempt < rules.MAX_QUEUE_ATTEMPTS; attempt += 1) {
        await queue.processQueue(true);
        assert.equal(S.idb.get(KEY).attempts, attempt);
        assert.ok(S.idb.get(KEY).nextAttemptAt > Date.now());
    }
    const before = S.idb.get(KEY).attempts;
    await queue.processQueue();
    assert.equal(S.idb.get(KEY).attempts, before, 'waits out its backoff');
    await queue.processQueue(true);
    assert.equal(S.idb.has(KEY), false);
    assert.match(S.idb.get(notices()[0]).reason, /kept failing/);
});

test('a signed-out device keeps the file until the teacher returns', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ session: null });
    await queue.processQueue();
    assert.ok(S.idb.has(KEY));
    assert.equal(notices().length, 0);
});

test('an expired token during transfer keeps the file', async () => {
    S.idb.set(KEY, makeItem());
    S.xhrUpload = async () => ({ ok: false, status: 401, body: '' });
    await queue.processQueue();
    assert.ok(S.idb.has(KEY));
    assert.equal(notices().length, 0);
});

test('another teacher\'s queued file on a shared computer is left alone', async () => {
    S.idb.set(KEY, makeItem({ options: { ...makeItem().options, userId: 'other-teacher' } }));
    S.xhrUpload = async () => assert.fail('must not send with the wrong account');
    await queue.processQueue();
    assert.ok(S.idb.has(KEY));
});

test('an upload that finished before its reply was lost is not sent again', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ submissions: filters => filters.file_hash ? { data: { id: 'done' }, error: null } : { data: null, error: null } });
    S.xhrUpload = async () => assert.fail('already committed');
    assert.equal((await queue.processQueue()).success, 1);
    assert.equal(S.idb.has(KEY), false);
});

test('only the first document for a load and week counts; a later one is supplementary', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ submissions: filters => filters.teaching_load_id ? { data: [{ id: 'first' }], error: null } : { data: null, error: null } });
    await queue.processQueue();
    assert.equal(S.supabase.inserts[0].compliance_status, 'supplementary');
});

test('dismissing a notice removes it for good', async () => {
    S.idb.set(KEY, makeItem());
    S.supabase = database({ academic_calendar: () => ({ data: null, error: null }) });
    await queue.processQueue();
    const key = notices()[0];
    await queue.loadFailedUploads();
    await queue.dismissFailedUpload(key);
    assert.equal(notices().length, 0);
});

test('failures are classified by whether trying again can help', () => {
    const { classifyQueueFailure: kind, httpUploadFailure: http, UploadRejectedError } = rules;
    assert.equal(kind(new TypeError('Failed to fetch')), 'network');
    assert.equal(kind({ message: 'TypeError: Failed to fetch', code: '' }), 'network');
    assert.equal(kind(new Error('Upload stalled — no data sent for a while.')), 'network');
    assert.equal(kind(http(503)), 'network');
    assert.equal(kind(http(429)), 'network');
    assert.equal(kind(http(500, 'storage error')), 'rejected');
    assert.equal(kind(http(413)), 'rejected');
    assert.equal(kind(http(401)), 'auth');
    assert.equal(kind({ code: 'PGRST301', message: 'JWT expired' }), 'auth');
    assert.equal(kind({ code: '42501', message: 'new row violates row-level security policy' }), 'rejected');
    assert.equal(kind({ code: '23505', message: 'duplicate key value violates unique constraint "uniq_counted_dll_slot"' }), 'network');
    assert.equal(kind(new DuplicateUploadError()), 'rejected');
    assert.equal(kind(new UploadRejectedError('Closed')), 'rejected');
    assert.equal(rules.nextAttemptDelay(1), 30000);
    assert.equal(rules.nextAttemptDelay(2), 60000);
    assert.equal(rules.nextAttemptDelay(9), 300000);
    assert.equal(rules.redoMessage('Week 7 is Closed'), 'Week 7 is Closed. Upload cancelled. Please upload the document again.');
});

test('no screen asks the teacher to press a sync button', () => {
    for (const file of ['src/routes/dashboard/upload/+page.svelte', 'src/lib/components/SyncStatus.svelte']) {
        assert.doesNotMatch(readFileSync(file, 'utf8'), /Sync All Now|Sync Now|processQueue\(/, file);
    }
});
