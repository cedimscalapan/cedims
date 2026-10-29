import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compilerOptions={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022};
let sequence=0;
async function loadOcr() {
 let source=readFileSync('src/lib/utils/ocr.ts','utf8')
  .replace("import { readHeaderPeriod } from './headerPeriod';","const readHeaderPeriod=()=>({termNumber:null,weekNumber:null,invalid:false});")
  .replace("import { extractTeachingLoadFields } from './teachingLoadFields';","const extractTeachingLoadFields=()=>({subject:null,subjectConfidence:0,grade:''});")
  .replace("import { predictSubject, predictGradeLevel, predictDocType, predictTermNumber } from './fuzzyClassifier';",'const empty=()=>({value:null,confidence:0}); const predictSubject=empty,predictGradeLevel=empty,predictDocType=empty,predictTermNumber=empty;')
  .replace("import { PDFJS_VERSION } from './pdfjsVersion';","const PDFJS_VERSION='3.4.120';")
  .replaceAll("await import('tesseract.js')",'globalThis.__tesseractMock');
 const code=ts.transpileModule(source+'\n//case '+sequence++,{compilerOptions}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const file={name:'sample.pdf',type:'application/pdf',arrayBuffer:async()=>new ArrayBuffer(1)};
test('warmup and file scanning share one pending reader download',async()=>{
 let appended=0,script;
 globalThis.window={};
 globalThis.document={createElement(){return {}},head:{appendChild(value){appended++;script=value}}};
 const ocr=await loadOcr();
 const a=ocr.warmPdfReader(),b=ocr.warmPdfReader();
 assert.equal(appended,1);
 window.pdfjsLib={GlobalWorkerOptions:{}};script.onload();
 await Promise.all([a,b]);
 assert.match(window.pdfjsLib.GlobalWorkerOptions.workerSrc,/3\.4\.120/);
});
test('failed reader download permits a later retry',async()=>{
 let script,appended=0;globalThis.window={};
 globalThis.document={createElement(){return {}},head:{appendChild(value){script=value;appended++}}};
 const ocr=await loadOcr();const first=ocr.warmPdfReader();script.onerror();await assert.rejects(first,/Failed to load/);
 const second=ocr.warmPdfReader();assert.equal(appended,2);window.pdfjsLib={GlobalWorkerOptions:{}};script.onload();await second;
});
test('text PDFs avoid image OCR and release their PDF worker after scanning',async()=>{
 let destroyed=0,ocrStarts=0;
 globalThis.__tesseractMock={createWorker:async()=>{ocrStarts++;throw new Error('unexpected image OCR')}};
 const text='DAILY LESSON LOG GMRC Grade 1 Term 2 Week 7 instructional content for this school week';
 globalThis.window={pdfjsLib:{GlobalWorkerOptions:{workerSrc:'mock'},getDocument(){return {promise:Promise.resolve({getPage:async()=>({getTextContent:async()=>({items:[{str:text,transform:[]}]})})}),destroy:async()=>{destroyed++}}}}};
 const result=await (await loadOcr()).extractMetadata(file);
 assert.equal(result.rawText,text);assert.equal(ocrStarts,0);assert.equal(destroyed,1);
});
test('cancelled text extraction releases resources and does not produce stale metadata',async()=>{
 const controller=new AbortController();let finish,started,destroyed=0;
 const ready=new Promise(resolve=>started=resolve);
 globalThis.window={pdfjsLib:{GlobalWorkerOptions:{workerSrc:'mock'},getDocument(){return {promise:Promise.resolve({getPage:async()=>({getTextContent:()=>{started();return new Promise(resolve=>finish=resolve)}})}),destroy:async()=>{destroyed++}}}}};
 const task=(await loadOcr()).extractMetadata(file,{signal:controller.signal});await ready;
 controller.abort();finish({items:[{str:'DAILY LESSON LOG '.repeat(10),transform:[]}]});
 const result=await task;assert.equal(result.rawText,'');assert.ok(destroyed>=1);
});
test('a pre-cancelled scan does not start a PDF or image worker',async()=>{
 const controller=new AbortController();controller.abort();let starts=0;
 globalThis.window={pdfjsLib:{getDocument(){starts++}}};
 await assert.rejects((await loadOcr()).extractMetadata(file,{signal:controller.signal}),error=>error.name==='AbortError');assert.equal(starts,0);
});
test('simultaneous upload-option refresh events share one request per account scope',async()=>{
 const page=readFileSync('src/routes/dashboard/upload/+page.svelte','utf8');
 const fn=page.slice(page.indexOf('    function fetchInitialData('),page.indexOf('    async function loadUploadOptions(')).replace('function fetchInitialData','export function fetchInitialData');
 const code=ts.transpileModule('let optionsRequest=null;const loadUploadOptions=globalThis.__loadOptionsMock;'+fn,{compilerOptions}).outputText;
 let calls=0;const resolvers=[];globalThis.__loadOptionsMock=()=>{calls++;return new Promise(resolve=>resolvers.push(resolve))};
 const {fetchInitialData}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 const profile={id:'a',role:'Teacher',school_id:'s',district_id:'d'};
 const first=fetchInitialData(profile);assert.equal(fetchInitialData(profile),first);assert.equal(calls,1);
 const other=fetchInitialData({...profile,id:'b'});assert.equal(calls,2);
 resolvers.forEach(resolve=>resolve());await Promise.all([first,other]);
 const refreshed=fetchInitialData(profile);assert.equal(calls,3);resolvers.at(-1)();await refreshed;
});

test('image OCR startup failure resolves safely and releases page memory',async()=>{
 let destroyed=0;const canvas={width:0,height:0,getContext:()=>({}),toBlob:callback=>callback(new Blob(['page']))};
 globalThis.document={createElement:()=>canvas};
 globalThis.__tesseractMock={createWorker:async()=>{throw new Error('worker download unavailable')}};
 const page={getTextContent:async()=>({items:[]}),getViewport:()=>({width:2,height:2}),render:()=>({promise:Promise.resolve(),cancel(){}})};
 globalThis.window={pdfjsLib:{GlobalWorkerOptions:{workerSrc:'mock'},getDocument:()=>({promise:Promise.resolve({getPage:async()=>page}),destroy:async()=>{destroyed++}})}};
 const result=await (await loadOcr()).extractMetadata(file);
 assert.equal(result.rawText,'');assert.equal(destroyed,1);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});
test('manual fallback stops an active image worker instead of leaving it in the background',async()=>{
 let stopped=0,rejectRecognition,started;const ready=new Promise(resolve=>started=resolve);const controller=new AbortController();
 const canvas={width:0,height:0,getContext:()=>({}),toBlob:callback=>callback(new Blob(['page']))};
 globalThis.document={createElement:()=>canvas};
 globalThis.__tesseractMock={createWorker:async()=>({recognize(){started();return new Promise((_,reject)=>rejectRecognition=reject)},async terminate(){stopped++;rejectRecognition(new Error('cancelled'))}})};
 const page={getTextContent:async()=>({items:[]}),getViewport:()=>({width:2,height:2}),render:()=>({promise:Promise.resolve(),cancel(){}})};
 globalThis.window={pdfjsLib:{GlobalWorkerOptions:{workerSrc:'mock'},getDocument:()=>({promise:Promise.resolve({getPage:async()=>page}),destroy:async()=>{}})}};
 const work=(await loadOcr()).extractMetadata(file,{signal:controller.signal});await ready;controller.abort();
 const result=await work;assert.equal(result.rawText,'');assert.equal(stopped,1);assert.equal(canvas.width,0);
});
