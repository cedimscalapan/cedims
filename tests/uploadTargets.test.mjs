import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/utils/uploadTargets.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { requestUploadTargets, openUploadTargets, chooseUploadPeriod, parseTrackerUploadTarget } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const year = '2026-2027';
const entries = [1, 2, 3].map(term => ({ id: `term-${term}`, term, week_number: 6, school_year: year, is_active: true, deadline_date: `2026-${String(term + 7).padStart(2, '0')}-19T02:00:00Z` }));

test('tracker links carry one teaching load and an exact term and week', () => {
    assert.deepEqual(parseTrackerUploadTarget(new URLSearchParams('load=math-4&term=2&week=5')), { loadId: 'math-4', term: 2, week: 5 });
    assert.equal(parseTrackerUploadTarget(new URLSearchParams('load=math-4&term=2.5&week=5')), null);
    assert.equal(parseTrackerUploadTarget(new URLSearchParams('load=math-4&term=2&week=0')), null);
    assert.equal(parseTrackerUploadTarget(new URLSearchParams('term=2&week=5')), null);
});

test('saved calendar produces identical targets without a network request', () => {
    const saved = JSON.parse(JSON.stringify(entries));
    assert.deepEqual(openUploadTargets(saved, year), openUploadTargets(entries, year));
    assert.equal(chooseUploadPeriod(saved, 2, 6).id, 'term-2');
});

test('refresh keeps the chosen term when week numbers repeat across terms', () => {
    assert.equal(chooseUploadPeriod([...entries].reverse(), 2, 6).id, 'term-2');
});

test('closed, other-year, and incomplete legacy cache entries are excluded', () => {
    const invalid = [{ ...entries[0], is_active: false }, { ...entries[0], school_year: '2025-2026' }, { id: 'legacy', week_number: 6, is_active: true }];
    assert.deepEqual(openUploadTargets([...entries, ...invalid], year), entries);
});

test('targets without deadlines still have a selectable default', () => {
    assert.equal(chooseUploadPeriod([{ ...entries[1], deadline_date: null }]).id, 'term-2');
    assert.equal(chooseUploadPeriod([]), undefined);
});

test('when a selected period closes, choose an available period in the same term', () => {
    const replacement = { ...entries[1], id: 'replacement', week_number: 7 };
    assert.equal(chooseUploadPeriod([entries[0], replacement], 2, 6).id, 'replacement');
});

test('stable connection returns all server targets', async () => {
    assert.deepEqual(await requestUploadTargets(async () => entries), entries);
});

test('failed connection rejects without changing saved targets', async () => {
    const saved = structuredClone(entries);
    await assert.rejects(requestUploadTargets(async () => { throw new Error('offline'); }), /offline/);
    assert.deepEqual(saved, entries);
});

test('online but stalled connection times out and aborts, preserving saved choices', async () => {
    let signal;
    await assert.rejects(requestUploadTargets((value) => { signal = value; return new Promise(() => {}); }, 15), /timed out/);
    assert.equal(signal.aborted, true);
    assert.equal(chooseUploadPeriod(entries, 2, 6).id, 'term-2');
});

test('a delayed response after timeout cannot replace the returned result', async () => {
    let finish;
    await assert.rejects(requestUploadTargets(() => new Promise(resolve => { finish = resolve; }), 15), /timed out/);
    finish([]);
    assert.equal(chooseUploadPeriod(entries, 2, 6).id, 'term-2');
});
