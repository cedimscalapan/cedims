import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('src/lib/utils/trackerReviewQueue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { pendingReviewUploads }=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
test('the review queue includes supplementary and late uploads and excludes checked and own files',()=>{
    const uploads=[{id:'own',user_id:'mt'},{id:'checked',user_id:'a'},{id:'late',user_id:'a',compliance_status:'late'},{id:'extra',user_id:'b',compliance_status:'supplementary'}];
    assert.deepEqual(pendingReviewUploads(uploads,[{submission_id:'checked'}],'mt'),uploads.slice(2));
});
test('queue keeps every document and its metadata in source order without mutating it',()=>{
    const uploads=Array.from({length:19},(_,n)=>({id:String(n),user_id:'a',term_number:2,week_number:9,file_name:`Lesson ${n}.pdf`}));
    const queue=pendingReviewUploads(uploads,[],'mt');
    assert.equal(queue.length,19);assert.equal(queue[8],uploads[8]);assert.equal(uploads.length,19);
    const reviewed=pendingReviewUploads(uploads,[{submission_id:'8'}],'mt');
    assert.equal(reviewed.length,18);assert.ok(!reviewed.some(doc=>doc.id==='8'));
});
