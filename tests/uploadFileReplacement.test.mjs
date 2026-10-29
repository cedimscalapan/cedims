import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compilerOptions={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022};
const url=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions}).outputText).toString('base64')}`;
const fuzzy=url(readFileSync('src/lib/utils/fuzzyClassifier.ts','utf8'));
const fields=url(readFileSync('src/lib/utils/teachingLoadFields.ts','utf8').replace("from './fuzzyClassifier'",`from '${fuzzy}'`));
const matcher=url(readFileSync('src/lib/utils/teachingLoadMatching.ts','utf8').replace("from './teachingLoadFields'",`from '${fields}'`));
const {resolveTeachingLoadMatch}=await import(matcher);
const deadline=url(readFileSync('src/lib/utils/deadlineRules.ts','utf8'));
const header=url(readFileSync('src/lib/utils/headerPeriod.ts','utf8').replace("from './deadlineRules'",`from '${deadline}'`));
const {resolveHeaderUploadPeriod,resolveUniqueOpenUploadPeriod}=await import(header);
const {preserveUploadPeriod}=await import(url(readFileSync('src/lib/utils/uploadTargets.ts','utf8')));
let sequence=0;
async function harness({online=false,refreshedCalendar=null,refreshedLoads=null}={}) {
 const requests=new Map();
 globalThis.__fileTest={resolveTeachingLoadMatch,resolveHeaderUploadPeriod,resolveUniqueOpenUploadPeriod,online,refreshedCalendar,refreshedLoads,toasts:[],extractMetadata:(file,{signal})=>new Promise((resolve,reject)=>requests.set(file.name,{resolve,reject,signal}))};
 const page=readFileSync('src/routes/dashboard/upload/+page.svelte','utf8');
 let fn=page.slice(page.indexOf('    function resetDocumentTargets()'),page.indexOf('    /** Auto-wait for profile'));
 fn=fn.replace('function resetDocumentTargets','export function resetDocumentTargets').replace('async function onFileSelected','export async function onFileSelected');
 let refresh=page.slice(page.indexOf('    let loadRefreshRun = 0;'),page.indexOf('    let showTermPicker = $state(false);')).replace('async function refreshTeachingLoads','export async function refreshTeachingLoads');
 let manual=page.slice(page.indexOf('    function useManualTargets()'),page.indexOf('    function resetDocumentTargets()')).replace('function useManualTargets','export function useManualTargets');
 const prefix=`const {resolveTeachingLoadMatch,resolveHeaderUploadPeriod,resolveUniqueOpenUploadPeriod,extractMetadata}=globalThis.__fileTest; const getCurrentSchoolYear=()=>"2026-2027"; const uploaderSchoolName=""; const navigator={get onLine(){return globalThis.__fileTest.online}}; const requestUploadTargets=async request=>request(new AbortController().signal); const cacheMetadata=async()=>{}; const openUploadTargets=(entries,year)=>entries.filter(entry=>entry.school_year===year&&entry.is_active===true); const supabase={from:(table)=>({select(){return this},eq(){return this},order(){return this},abortSignal(){return Promise.resolve({data:table==='teaching_loads'?globalThis.__fileTest.refreshedLoads:globalThis.__fileTest.refreshedCalendar,error:null})}})};
let metadataRun=0,submissionCheckRun=0,scanController=null,trackerTarget=null,teachingLoadId='old',subject='Filipino',termNumber=1,weekNumber=6,currentDeadline={},detectedMetadata={},mismatchAlert={},ocrConfidence=100,detectingMetadata=false,scanProgress=100,slotAlreadyCovered=true,slotNotice='old',submissionAlreadyExists=true,submissionBlockReason='old',targetConfirmed=true,uploadConfirmed=true,confirmArchiveOpen=true,showLoadPicker=false,showTermPicker=false,showWeekPicker=false,result=null,showSuccessModal=false,completedDetails=null,awaitingArchive=null,progress=100,message='old',currentPhase='done',selectedFile=null,processing=false,checkingTarget=false,loadingTeachingLoads=false,docTypeManuallySelected=true,docType='DLL';
const $settings={maintenance_mode:false},$profile={id:'teacher',district_id:'district'},MAX_SELECTED_PDF_BYTES=4000000,MAX_SELECTED_PDF_SIZE_MB=4,PDF_COMPRESSOR_URL='compressor';
let teachingLoads=[{id:'filipino',subject:'Filipino',grade_level:'Grade 5'},{id:'math',subject:'Mathematics',grade_level:'Grade 5'}];
let calendarEntries=[{id:'one',term:1,week_number:6,is_active:true,school_year:'2026-2027'},{id:'two',term:2,week_number:7,is_active:true,school_year:'2026-2027'},{id:'three',term:1,week_number:7,is_active:true,school_year:'2026-2027'}];
let allCalendarEntries=calendarEntries;
const isWeeklyComplianceDocType=type=>type==='DLL';const addToast=(...args)=>globalThis.__fileTest.toasts.push(args);const debugLog=(...args)=>globalThis.__fileTest.toasts.push(args.map(String));const waitForDataReady=async()=>true;const setDocType=type=>docType=type;const validateSelection=()=>null;const createDefaultMetadata=()=>({rawText:''});const resolveWeekFromDates=()=>null;const parseDocDate=value=>new Date(value);const lookupWeekByDate=async()=>null;
`;
 const snapshot=`export function snapshot(){return {teachingLoadId,termNumber,weekNumber,detectedMetadata,mismatchAlert,detectingMetadata,slotNotice,targetConfirmed};}export function getCalendar(){return allCalendarEntries;}export function getLoads(){return teachingLoads;}export function manualChoice(){teachingLoadId='math';termNumber=2;weekNumber=7;}export function setCalendar(entries){calendarEntries.splice(0,calendarEntries.length,...entries);}export function setLoads(entries){teachingLoads=entries;}\n//${sequence++}`;
 const ui=await import(url(prefix+refresh+manual+fn+snapshot));return {ui,requests};
}
const file=name=>({name,type:'application/pdf',size:1000});
const metadata=(subject,term=2,week=7)=>({docType:'DLL',termNumber:term,weekNumber:week,confidence:100,rawText:`Learning Area/s: ${subject}\nGrade Level and Section: 5 - Rose\n${term ? 'Term: '+term : ''}\nWeek: ${week}`});
test('a slow Filipino scan cannot overwrite a newer Math file',async()=>{
 const {ui,requests}=await harness();const old=ui.onFileSelected(file('Filipino.pdf'));const current=ui.onFileSelected(file('Math.pdf'));
 assert.equal(requests.get('Filipino.pdf').signal.aborted,true);
 requests.get('Math.pdf').resolve(metadata('Mathematics'));await current;
 requests.get('Filipino.pdf').resolve(metadata('Filipino',1,6));await old;
 assert.equal(ui.snapshot().teachingLoadId,'math');assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,7);assert.match(ui.snapshot().detectedMetadata.rawText,/Mathematics/);
});
test('replacing a completed Filipino file clears all details while Math scans',async()=>{
 const {ui,requests}=await harness();const first=ui.onFileSelected(file('Filipino.pdf'));requests.get('Filipino.pdf').resolve(metadata('Filipino',1,6));await first;
 assert.equal(ui.snapshot().teachingLoadId,'filipino');
 const second=ui.onFileSelected(file('Math.pdf'));const state=ui.snapshot();
 assert.equal(state.teachingLoadId,'');assert.equal(state.termNumber,undefined);assert.equal(state.weekNumber,undefined);assert.equal(state.detectedMetadata,null);assert.equal(state.mismatchAlert,null);assert.equal(state.slotNotice,'');
 requests.get('Math.pdf').resolve(metadata('Mathematics'));await second;assert.equal(ui.snapshot().teachingLoadId,'math');
});
test('manual selections cannot be overwritten by a scan finishing later',async()=>{
 const {ui,requests}=await harness();const work=ui.onFileSelected(file('Filipino.pdf'));ui.useManualTargets();ui.manualChoice();requests.get('Filipino.pdf').resolve(metadata('Filipino',1,6));await work;
 assert.equal(ui.snapshot().teachingLoadId,'math');assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,7);
});
test('a new document with an ambiguous week does not inherit the old term',async()=>{
 const {ui,requests}=await harness();const work=ui.onFileSelected(file('Math.pdf'));requests.get('Math.pdf').resolve(metadata('Mathematics',null,7));await work;
 assert.equal(ui.snapshot().teachingLoadId,'math');assert.equal(ui.snapshot().termNumber,undefined);assert.equal(ui.snapshot().weekNumber,undefined);
});
test('an unreadable PDF period selects the only Open term and week',async()=>{
 const {ui,requests}=await harness();ui.setCalendar([{id:'closed',term:1,week_number:7,is_active:false,school_year:'2026-2027'},{id:'open',term:2,week_number:8,is_active:true,school_year:'2026-2027'}]);
 const work=ui.onFileSelected(file('Math.pdf'));requests.get('Math.pdf').resolve({docType:'DLL',rawText:'Learning Area: Mathematics\nGrade Level: 5',confidence:80});await work;
 assert.equal(ui.snapshot().teachingLoadId,'math');assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,8);
});
test('a fresh live calendar replaces a stale cached week before the period fallback',async()=>{
 const current=[{id:'closed',term:2,week_number:6,is_active:false,school_year:'2026-2027'},{id:'open',term:2,week_number:7,is_active:true,school_year:'2026-2027'}];
 const {ui,requests}=await harness({online:true,refreshedCalendar:current});
 ui.setCalendar([{id:'stale',term:2,week_number:6,is_active:true,school_year:'2026-2027'}]);
 const work=ui.onFileSelected(file('Science.pdf'));requests.get('Science.pdf').resolve({docType:'DLL',rawText:'Learning Area: Mathematics\nGrade Level: 5\nTeaching Date: October 10, 2026',confidence:80});await work;
 assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,7,JSON.stringify({calendar:ui.getCalendar(),toasts:globalThis.__fileTest.toasts}));
});
test('a stale roster refreshes and selects an active Science Grade 5 load',async()=>{
 const roster=[{id:'science5',subject:'Science',grade_level:'Grade 5'},{id:'science6',subject:'Science',grade_level:'Grade 6'}];
 const current=[{id:'open',term:2,week_number:7,is_active:true,school_year:'2026-2027'}];
 const {ui,requests}=await harness({online:true,refreshedLoads:roster,refreshedCalendar:current});
 ui.setLoads([roster[1]]);ui.setCalendar(current);
 const work=ui.onFileSelected(file('Science Grade 5.pdf'));
 requests.get('Science Grade 5.pdf').resolve({docType:'DLL',rawText:'Learning Area: Science\nGrade Level: 5',confidence:80});await work;
 assert.equal(ui.snapshot().teachingLoadId,'science5');
 assert.deepEqual(ui.getLoads().map(load=>load.id),['science5','science6']);
 assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,7);
});
test('the load picker can refresh a stale roster before manual selection',async()=>{
 const roster=[{id:'science5',subject:'Science',grade_level:'Grade 5'},{id:'science6',subject:'Science',grade_level:'Grade 6'}];
 const {ui}=await harness({online:true,refreshedLoads:roster});
 ui.setLoads([roster[1]]);
 await ui.refreshTeachingLoads();
 assert.deepEqual(ui.getLoads().map(load=>load.id),['science5','science6']);
});
test('a failed PDF scan still fills only the unique Open period, leaving the load for review',async()=>{
 const {ui,requests}=await harness();ui.setCalendar([{id:'open',term:2,week_number:8,is_active:true,school_year:'2026-2027'}]);
 const work=ui.onFileSelected(file('Unreadable.pdf'));requests.get('Unreadable.pdf').reject(new Error('OCR failed'));await work;
 assert.equal(ui.snapshot().teachingLoadId,'');assert.equal(ui.snapshot().termNumber,2);assert.equal(ui.snapshot().weekNumber,8);
});
test('post-upload target reset clears the next form completely',async()=>{
 const {ui,requests}=await harness();const work=ui.onFileSelected(file('Math.pdf'));requests.get('Math.pdf').resolve(metadata('Mathematics'));await work;ui.resetDocumentTargets();
 assert.deepEqual(ui.snapshot(),{teachingLoadId:'',termNumber:undefined,weekNumber:undefined,detectedMetadata:null,mismatchAlert:null,detectingMetadata:false,slotNotice:'',targetConfirmed:false});
});
test('options refresh cannot populate an empty or invalid term/week selection',()=>{
 const entries=[{id:'one',term:1,week_number:7},{id:'two',term:2,week_number:7,is_active:true,school_year:'2026-2027'}];
 assert.equal(preserveUploadPeriod(entries),undefined);assert.equal(preserveUploadPeriod(entries,2),undefined);assert.equal(preserveUploadPeriod(entries,3,7),undefined);assert.equal(preserveUploadPeriod(entries,2,7).id,'two');
});
