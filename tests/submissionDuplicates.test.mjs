import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/utils/submissionDuplicates.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { assertNoDatabaseDuplicate, DuplicateUploadError } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function database(rows, error = null) {
 return { from(table) {
  assert.equal(table, 'submissions');
  const filters = [];
  const query = {
   select() { return query; },
   eq(key, value) { filters.push(row => row[key] === value); return query; },
   neq(key, value) { filters.push(row => row[key] !== value); return query; },
   async limit(n) { return { data: rows.filter(row => filters.every(f => f(row))).slice(0,n), error }; }
  };
  return query;
 } };
}
test('a current identical document blocks, but deletion immediately permits reupload', async () => {
 const rows = [{ id: 'wrong-slot', user_id: 'teacher', content_hash: 'contents', file_hash: 'old-qr' }];
 const db = database(rows);
 await assert.rejects(assertNoDatabaseDuplicate(db, 'teacher', 'contents', 'new-qr'), DuplicateUploadError);
 rows.splice(0);
 await assert.doesNotReject(assertNoDatabaseDuplicate(db, 'teacher', 'contents', 'new-qr'));
});
test('another teacher or different contents do not block an upload', async () => {
 const db = database([{user_id:'other', content_hash:'contents', file_hash:'old'}, {user_id:'teacher', content_hash:'different', file_hash:'old2'}]);
 await assert.doesNotReject(assertNoDatabaseDuplicate(db, 'teacher', 'contents', 'new'));
});
test('a retry of the same archive event is not a new duplicate', async () => {
 await assert.doesNotReject(assertNoDatabaseDuplicate(database([{user_id:'teacher', content_hash:'contents', file_hash:'same'}]), 'teacher', 'contents', 'same'));
});
test('database errors are not treated as a successful duplicate check', async () => {
 await assert.rejects(assertNoDatabaseDuplicate(database([], {message:'unavailable'}), 'teacher', 'contents', 'new'), /Could not check/);
});
test('legacy cleanup removes only duplicate-history keys', async () => {
 const removed = [];
 const cleanupSource = readFileSync(new URL('../src/lib/utils/offlineSubmissionLedger.ts', import.meta.url), 'utf8')
  .replace("import { del, keys } from 'idb-keyval';", "const { del, keys } = globalThis.__ledgerTest;");
 globalThis.__ledgerTest = { keys: async () => ['ledger_slot_old', 'ledger_hash_old', 'sync_queue_pending', 'verified_doc', 42], del: async key => removed.push(key) };
 const js = ts.transpileModule(cleanupSource, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
 const {clearLegacySubmissionLedger} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
 await clearLegacySubmissionLedger();
 assert.deepEqual(removed.sort(), ['ledger_hash_old', 'ledger_slot_old']);
 delete globalThis.__ledgerTest;
});
