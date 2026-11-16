import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/utils/complianceUploadComparison.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { uploadsBySchool, uploadsByTeacher } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const uploaders = [
    { id: 'teacher-a', full_name: 'Ana Teacher', school_id: 'school-a', role: 'Teacher' },
    { id: 'master-a', full_name: 'Beth Master', school_id: 'school-a', role: 'Master Teacher' },
    { id: 'head-a', full_name: 'Chris Head', school_id: 'school-a', role: 'School Head' },
    { id: 'teacher-b', full_name: 'Dina Teacher', school_id: 'school-b', role: 'Teacher' },
];
const uploads = [
    { user_id: 'teacher-a' }, { user_id: 'teacher-a' },
    { user_id: 'master-a' }, { user_id: 'head-a' },
    { user_id: 'teacher-b' },
];

test('district comparison counts scoped files by school and keeps zero-upload schools visible', () => {
    assert.deepEqual(uploadsBySchool(uploads, uploaders, [
        { id: 'school-a', name: 'School A' },
        { id: 'school-b', name: 'School B' },
        { id: 'school-c', name: 'School C' },
    ]), [
        { id: 'school-a', label: 'School A', value: 4 },
        { id: 'school-b', label: 'School B', value: 1 },
        { id: 'school-c', label: 'School C', value: 0 },
    ]);
});

test('school pie has one DLL upload count per Teacher and Master Teacher', () => {
    assert.deepEqual(uploadsByTeacher(uploads.filter(row => row.user_id !== 'teacher-b'), uploaders.filter(user => user.school_id === 'school-a')), [
        { id: 'teacher-a', label: 'Ana Teacher', role: 'Teacher', value: 2 },
        { id: 'master-a', label: 'Beth Master', role: 'Master Teacher', value: 1 },
    ]);
});
