import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/utils/pieSlices.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { makePieSlices } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('slice labels total 100 and zero uploads have no sector', () => {
    const slices = makePieSlices([
        { id: 'a', value: 43 }, { id: 'b', value: 107 }, { id: 'c', value: 0 }, { id: 'd', value: 122 },
    ]);
    assert.deepEqual(slices.map(slice => slice.id), ['a', 'b', 'd']);
    assert.equal(slices.reduce((sum, slice) => sum + slice.percent, 0), 100);
    assert.ok(slices.every(slice => slice.path.endsWith('Z')));
});

test('single teacher produces a full circle', () => {
    const [slice] = makePieSlices([{ id: 'only', value: 5 }]);
    assert.equal(slice.percent, 100);
    assert.equal((slice.path.match(/ A /g) || []).length, 2);
    assert.equal(slice.labelX, 120);
    assert.equal(slice.labelY, 120);
});
