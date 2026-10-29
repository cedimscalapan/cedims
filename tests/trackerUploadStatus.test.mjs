import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
async function load(source) {
 const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { submissionWindowOpen } = await load(readFileSync('src/lib/utils/deadlineRules.ts','utf8'));
const calendar={is_active:true,deadline_date:'2026-10-19T02:00:00Z'};
test('Open periods keep upload actions after the deadline, including more than three days late',()=>{
 assert.equal(submissionWindowOpen(calendar,'GMRC',null,Date.parse('2026-10-19T01:59:59Z')),true);
 for(const date of ['2026-10-19T02:00:00Z','2026-10-20T02:00:00Z','2026-10-23T02:00:00Z','2026-11-19T02:00:00Z'])
  assert.equal(submissionWindowOpen(calendar,'GMRC',null,Date.parse(date)),true);
});
test('only an explicit Open calendar flag offers actions',()=>{
 const now=Date.parse('2026-10-18');
 for(const c of [{...calendar,is_active:false},{...calendar,is_active:undefined},{}]) assert.equal(submissionWindowOpen(c,'GMRC',null,now),false);
 for(const c of [{is_active:true},{...calendar,deadline_date:'invalid'}]) assert.equal(submissionWindowOpen(c,'GMRC',null,now),true);
});
test('subject-specific deadlines never override an Open calendar flag',()=>{
 assert.equal(submissionWindowOpen(calendar,'HGP',null,Date.parse('2026-10-19T03:00:00Z')),true);
 assert.equal(submissionWindowOpen(calendar,'HGP',null,Date.parse('2026-10-20T02:00:00Z')),true);
 assert.equal(submissionWindowOpen(calendar,'HGP','Bulusan Elementary School',Date.parse('2026-10-22T02:00:00Z')),true);
 assert.equal(submissionWindowOpen(calendar,'HGP','Bulusan Elementary School',Date.parse('2026-10-23T02:00:00Z')),true);
});
test('local queue completion never emits an archived success',async()=>{
 const source=readFileSync('src/lib/utils/pipeline.ts','utf8');
 let queued=[];
 globalThis.__queueTest={enqueue:async item=>queued.push(item),cacheVerifiedDoc:async()=>{}};
 let fn=source.slice(source.indexOf('async function* runOfflinePipelineResilient('),source.indexOf('export async function* runPipeline('));
 fn=fn.replace('async function*','export async function*').replace("await import('./offline')",'globalThis.__queueTest');
 const {runOfflinePipelineResilient}=await load('const getCurrentSchoolYear=()=>"2026-2027";\n'+fn);
 const events=[];
 for await(const event of runOfflinePipelineResilient({contentHash:'content',stampedBytes:new Uint8Array([1]),fileHash:'qr',fileName:'a.pdf',filePath:'a',activeDocType:'DLL',activeTermNumber:2,activeWeekNumber:7,rawText:''},{userId:'teacher'}))events.push(event);
 assert.equal(queued.length,1);
 assert.equal(events.at(-1).phase,'queued');
 assert.ok(events.at(-1).progress<100);
 assert.equal(events.some(e=>e.phase==='done'),false);
 delete globalThis.__queueTest;
});
test('success form waits for a confirmed database row and never opens on lookup failure', async()=>{
 const source=readFileSync('src/routes/dashboard/upload/+page.svelte','utf8');
 let fn=source.slice(source.indexOf('    async function confirmPendingArchive()'),source.indexOf('    let mismatchAlert'));
 fn=fn.replace('async function confirmPendingArchive','export async function confirmPendingArchive')
  .replace("await import('$lib/utils/voiceGuide')",'({speak:()=>{},VoicePrompts:{UPLOAD_COMPLETE:"done"}})');
 const prefix=`const navigator={onLine:true}; let awaitingArchive={fileHash:'qr',filePath:'path'}, checkingArchive=false, $profile={id:'teacher'}, result=null, currentPhase='queued', progress=90, message='Waiting', showSuccessModal=false; const supabase=globalThis.__confirmationDb;`;
 const rows={data:null,error:null};
 const q={select(){return q},eq(){return q},limit(){return q},async maybeSingle(){return rows}};
 globalThis.__confirmationDb={from(){return q}};
 const ui=await load(prefix+fn+'\nexport function snapshot(){return {showSuccessModal,currentPhase,progress,awaitingArchive};}');
 await ui.confirmPendingArchive();
 assert.equal(ui.snapshot().showSuccessModal,false);
 rows.error={message:'offline'};
 await ui.confirmPendingArchive();
 assert.equal(ui.snapshot().showSuccessModal,false);
 rows.error=null; rows.data={id:'saved'};
 await ui.confirmPendingArchive();
 assert.equal(ui.snapshot().showSuccessModal,true);
 assert.equal(ui.snapshot().progress,100);
 assert.equal(ui.snapshot().awaitingArchive,null);
 delete globalThis.__confirmationDb;
});
