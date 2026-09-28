import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(
    readFileSync(new URL('../src/lib/utils/clusterAnalytics.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }
).outputText;
const { extractFeatures, runKMeansClustering, canCluster } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const teachers = [
    { id: 'a', full_name: 'Teacher A', school_name: 'North School' },
    { id: 'b', full_name: 'Teacher B', school_name: 'North School' },
    { id: 'c', full_name: 'Teacher C', school_name: 'South School' },
    { id: 'd', full_name: 'Teacher D', school_name: 'South School' },
];

test('K-means groups submission behavior into three follow-up clusters', () => {
    const submissions = [
        ...[1, 2, 3, 4].map(week => ({ user_id: 'a', compliance_status: 'on-time', week_number: week, created_at: `2026-09-0${week}T08:00:00Z` })),
        ...[1, 2, 3].map(week => ({ user_id: 'b', compliance_status: 'late', week_number: week, created_at: `2026-09-0${week}T17:00:00Z` })),
        { user_id: 'c', compliance_status: 'on-time', week_number: 1, created_at: '2026-09-01T08:00:00Z' },
    ];
    const features = extractFeatures(teachers, submissions, 4);
    const output = runKMeansClustering(features, 3);
    assert.equal(canCluster(features.length, submissions.length), true);
    assert.equal(output.summaries.length, 3);
    assert.deepEqual(new Set(output.summaries.map(s => s.label)), new Set(['Consistently Meeting Standards', 'Steadily Progressing', 'Building Momentum']));
    assert.equal(output.results.find(r => r.teacher.teacherId === 'd')?.clusterLabel, 'Building Momentum');
    assert.equal(output.results.find(r => r.teacher.teacherId === 'a')?.clusterLabel, 'Consistently Meeting Standards');
});
