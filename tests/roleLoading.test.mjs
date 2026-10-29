import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compilerOptions={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022};
const deadlineCode=ts.transpileModule(readFileSync('src/lib/utils/deadlineRules.ts','utf8'),{compilerOptions}).outputText;
const deadlineUrl=`data:text/javascript;base64,${Buffer.from(deadlineCode).toString('base64')}`;
const source=readFileSync('src/lib/utils/compliance.ts','utf8').replace("import { effectiveDeadlineForSubject } from './deadlineRules';",`import { effectiveDeadlineForSubject } from '${deadlineUrl}';`);
const code=ts.transpileModule(source,{compilerOptions}).outputText;
const {fetchRowsForIds}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('bounded parallel batches keep every unique ID and deterministic results',async()=>{
 const ids=Array.from({length:501},(_,i)=>String(i));let active=0,peak=0,calls=0;
 const rows=await fetchRowsForIds([...ids,...ids.slice(0,90)],batch=>({async range(){
  calls++;assert.ok(batch.length<=75);active++;peak=Math.max(active,peak);
  await delay(2+(501-Number(batch[0]))%7);active--;
  return {data:batch.map(id=>({id}))};
 }}));
 assert.deepEqual(rows.map(r=>r.id),ids);
 assert.equal(calls,7);assert.equal(peak,4);assert.equal(active,0);
});
test('each batch reads every API page before producing report totals',async()=>{
 const seen=[];
 const rows=await fetchRowsForIds(['teacher'],batch=>({async range(start,end){
  seen.push([start,end]);return {data:Array.from({length:620},(_,id)=>({id,user:batch[0]})).slice(start,end+1)};
 }}));
 assert.equal(rows.length,620);assert.equal(new Set(rows.map(r=>r.id)).size,620);
 assert.deepEqual(seen,[[0,499],[500,999]]);
});
test('a failed batch rejects the report instead of returning partial totals',async()=>{
 const ids=Array.from({length:400},(_,i)=>String(i));const failure=new Error('permission denied');
 await assert.rejects(fetchRowsForIds(ids,batch=>({async range(){
  if(batch.includes('75'))return {error:failure};await delay(3);return {data:batch};
 }})),error=>error===failure);
});
test('an empty scope makes no network requests',async()=>{
 assert.deepEqual(await fetchRowsForIds([],()=>{throw new Error('should not query')}),[]);
});
