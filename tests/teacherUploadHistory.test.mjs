import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync('src/lib/utils/teacherUploadHistory.ts','utf8'), { compilerOptions:{ module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022 } }).outputText;
const { uploadedDocumentsOldestFirst } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('history retains every saved upload, status, type and school year in chronological order', () => {
    const items = [
        {id:'new',file_path:'new.pdf',created_at:'2026-11-09T04:00:00Z',doc_type:'DLP',compliance_status:'supplementary',school_year:'2026-2027'},
        {id:'old',file_path:'old.pdf',created_at:'2025-08-01T04:00:00Z',doc_type:'ISP',compliance_status:'late',school_year:'2025-2026'},
        {id:'middle',file_path:'middle.pdf',created_at:'2026-10-01T04:00:00Z',doc_type:'DLL',compliance_status:'compliant'},
        {id:'report',file_path:'report.pdf',created_at:'2026-10-01T05:00:00Z',doc_type:'ISR',compliance_status:'supplementary'},
        {id:'no-upload',file_path:null,created_at:'2025-01-01T00:00:00Z'}
    ];
    const history = uploadedDocumentsOldestFirst(items);
    assert.deepEqual(history.map(item=>item.id), ['old','middle','report','new']);
    assert.equal(history[0],items[1]);
    assert.equal(items[0].id,'new');
});
test('history paginates all files without losing same-day uploads', () => {
    const items=Array.from({length:25},(_,n)=>({id:String(n).padStart(2,'0'),file_path:`${n}.pdf`,created_at:'2026-11-09T00:00:00Z'})).reverse();
    const history=uploadedDocumentsOldestFirst(items);
    const pages=Array.from({length:Math.ceil(history.length/8)},(_,n)=>history.slice(n*8,(n+1)*8));
    assert.equal(pages.flat().length,25);
    assert.equal(new Set(pages.flat().map(item=>item.id)).size,25);
    assert.equal(history[0].id,'00');
});
