import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const options={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022};
const url=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:options}).outputText).toString('base64')}`;
const fuzzyUrl=url(readFileSync('src/lib/utils/fuzzyClassifier.ts','utf8'));
const fieldsUrl=url(readFileSync('src/lib/utils/teachingLoadFields.ts','utf8').replace("from './fuzzyClassifier'",`from '${fuzzyUrl}'`));
const {extractTeachingLoadFields}=await import(fieldsUrl);
const deadlineUrl=url(readFileSync('src/lib/utils/deadlineRules.ts','utf8'));
const headerUrl=url(readFileSync('src/lib/utils/headerPeriod.ts','utf8').replace("from './deadlineRules'",`from '${deadlineUrl}'`));
const matcherUrl=url(readFileSync('src/lib/utils/teachingLoadMatching.ts','utf8').replace("from './teachingLoadFields'",`from '${fieldsUrl}'`));
const {resolveTeachingLoadMatch,validAssignedLoad,loadGrade,inferUploadSubject}=await import(matcherUrl);
const copilotSource=readFileSync('src/lib/utils/copilot.ts','utf8').replace("from './teachingLoadFields'",`from '${fieldsUrl}'`).replace("from './teachingLoadMatching'",`from '${matcherUrl}'`).replace("import copilotConfig from '../models/copilot_model.json';",'const copilotConfig={};');
const {validateSelection}=await import(url(copilotSource));
const loads=[{id:'gmrc1',subject:'GMRC',grade_level:'Grade 1'},{id:'math1',subject:'Mathematics',grade_level:'Grade 1'},{id:'math5',subject:'Math',grade_level:'Grade 5'}];

test('Kinder teaching loads are valid for manual and detected uploads',()=>{
 const kinderLoads=[
  {id:'language-k',subject:'Language, Literacy and Communication',grade_level:'Kinder',is_active:true},
  {id:'math-k',subject:'Mathematics',grade_level:'Kinder',is_active:true}
 ];
 assert.equal(loadGrade('Kindergarten'),'K');
 assert.equal(loadGrade('Grade Kinder'),'K');
 for(const load of kinderLoads) assert.equal(validAssignedLoad(load),true);
 assert.equal(validAssignedLoad({...kinderLoads[0],is_active:false}),false);
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s: Language, Literacy and Communication\nGrade Level and Section: Kinder - Sampaguita'},kinderLoads).loadId,'language-k');
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s: Mathematics\nGrade Level and Section: Kindergarten - Sampaguita'},kinderLoads).loadId,'math-k');
 assert.equal(validateSelection('language-k','Learning Area/s: Language, Literacy and Communication\nGrade Level and Section: Kinder',kinderLoads),null);
});

test('each Kindergarten learning area matches only its assigned Kinder load',()=>{
 const areas=[
  'Literacy, Language, and Communication',
  'Socio-Emotional Development',
  'Values Development',
  'Physical Health and Motor Development',
  'Aesthetic/Creative Development',
  'Cognitive Development'
 ];
 const assigned=areas.map((subject,index)=>({id:`kinder-${index}`,subject,grade_level:'Kinder',is_active:true}));
 for(const [index,subject] of areas.entries()) {
  const rawText=`DAILY LESSON LOG\nLearning Area/s: ${subject}\nGrade Level and Section: Kindergarten - Sampaguita`;
  const match=resolveTeachingLoadMatch({rawText},assigned);
  assert.equal(match.loadId,`kinder-${index}`,subject);
  assert.equal(validateSelection(match.loadId,rawText,assigned),null,subject);
  const other=assigned[(index+1)%assigned.length];
  assert.equal(validateSelection(other.id,rawText,assigned)?.type,'mismatch',subject);
 }
 const alternate='Learning Area/s: Language, Literacy and Communication\nGrade Level: Kinder';
 assert.equal(resolveTeachingLoadMatch({rawText:alternate},assigned).loadId,'kinder-0');
 const unavailable=assigned.map(load=>load.id==='kinder-5'?{...load,is_active:false}:load);
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s: Cognitive Development\nGrade Level: Kinder'},unavailable).loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:'DAILY LESSON LOG\nCognitive Development\nGrade Level and Section: Kinder - Sampaguita'},assigned).loadId,'kinder-5');
 assert.equal(resolveTeachingLoadMatch({rawText:'DAILY LESSON LOG\nCognitive Development\nValues Development\nGrade Level: Kinder'},assigned).loadId,null);
 const oneAssigned=[assigned[5]];
 assert.equal(resolveTeachingLoadMatch({rawText:'DAILY LESSON LOG\nCognitive Development\nValues Development\nGrade Level: Kinder'},oneAssigned).loadId,'kinder-5');
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s: Values Development\nLearning Area/s: Cognitive Development\nGrade Level: Kinder'},oneAssigned).loadId,'kinder-5');
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s: Values Development\nLearning Area/s: Cognitive Development\nGrade Level: Kinder'},[assigned[2],assigned[5]]).reason,'ambiguous');
});
test('Kinder PDF filenames match all six assigned learning areas when the header is unreadable',()=>{
 const names=[
  'DLL_Kinder_Literacy_Language_and_Communication_W7.pdf',
  'DLL-Kindergarten-Socio-Emotional Development.pdf',
  'Values Development Kinder Week 7.pdf',
  'PHMD_Kinder_DLL.pdf',
  'Aesthetic-Creative-Development_Kinder.pdf',
  'Cognitive Development - Kinder.pdf'
 ];
 const subjects=['Literacy, Language, and Communication','Socio-Emotional Development','Values Development','Physical Health and Motor Development','Aesthetic/Creative Development','Cognitive Development'];
 const assigned=subjects.map((subject,index)=>({id:`k-${index}`,subject,grade_level:'Kinder',is_active:true}));
 for(const [index,fileName] of names.entries()) {
  const metadata={rawText:'DAILY LESSON LOG\nGrade Level and Section: Kinder - Sampaguita'};
  assert.equal(resolveTeachingLoadMatch(metadata,assigned,fileName).loadId,`k-${index}`,fileName);
  assert.equal(inferUploadSubject(metadata,fileName),subjects[index]);
 }
 assert.equal(resolveTeachingLoadMatch({rawText:''},assigned,'LLC_Kinder.pdf').loadId,'k-0');
 assert.equal(resolveTeachingLoadMatch({rawText:''},assigned,'LLC_Kinder.pdf').grade,'K');
});
test('a clear Kinder filename takes priority over a conflicting OCR subject, but not a conflicting grade',()=>{
 const assigned=[
  {id:'values',subject:'Values Development',grade_level:'Kinder'},
  {id:'cognitive',subject:'Cognitive Development',grade_level:'Kinder'},
  {id:'math5',subject:'Mathematics',grade_level:'Grade 5'}
 ];
 const multi={rawText:'Learning Area/s: Values Development\nLearning Area/s: Cognitive Development\nGrade Level: Kinder'};
 assert.equal(resolveTeachingLoadMatch(multi,assigned,'Cognitive Development Kinder.pdf').loadId,'cognitive');
 assert.equal(resolveTeachingLoadMatch(multi,assigned,'Socio-Emotional Development Kinder.pdf').loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: Values Development\nGrade Level: Kinder'},assigned,'Cognitive Development Kinder.pdf').loadId,'cognitive');
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: Mathematics\nGrade Level: 5'},assigned,'Cognitive Development Kinder.pdf').loadId,'math5');
 assert.equal(resolveTeachingLoadMatch({rawText:'Grade Level: 5'},assigned,'Cognitive Development Kinder.pdf').loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:'Grade Level: Kinder'},assigned,'Cognitive Development Values Development.pdf').loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:'Grade Level: Kinder'},[{...assigned[1],is_active:false}],'Cognitive Development Kinder.pdf').loadId,null);
});
test('reported Kindergarten Mathematics filename corrects a wrong Socio-Emotional scan',()=>{
 const assigned=[
  {id:'sed-k',subject:'Socio-Emotional Development',grade_level:'Kinder',is_active:true},
  {id:'math-k',subject:'Mathematics',grade_level:'Kinder',is_active:true},
  {id:'math-5',subject:'Mathematics',grade_level:'Grade 5',is_active:true}
 ];
 const fileName='KINDERGARTEN WK 7 DAY 1 MATHEMATICS (1).pdf';
 const metadata={rawText:'Learning Area/s: Socio-Emotional Development\nGrade Level and Section: Kindergarten - Sampaguita'};
 assert.equal(inferUploadSubject(metadata,fileName),'Mathematics');
 assert.equal(resolveTeachingLoadMatch(metadata,assigned,fileName).loadId,'math-k');
 assert.equal(validateSelection('math-k',metadata.rawText,assigned,metadata,fileName),null);
 assert.equal(validateSelection('sed-k',metadata.rawText,assigned,metadata,fileName)?.type,'mismatch');
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: Socio-Emotional Development'},assigned,fileName).loadId,'math-k');
 assert.equal(resolveTeachingLoadMatch(metadata,assigned.filter(load=>load.id!=='math-k'),fileName).loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:'Grade Level: 5'},assigned,fileName).loadId,null);
 assert.equal(resolveTeachingLoadMatch({rawText:''},assigned,'MATH GRADE 5.pdf').loadId,null);
});
test('Kinder filenames correct a conflicting scan for every official learning area',()=>{
 const subjects=['Literacy, Language, and Communication','Socio-Emotional Development','Values Development','Physical Health and Motor Development','Aesthetic/Creative Development','Cognitive Development'];
 const assigned=subjects.map((subject,index)=>({id:`area-${index}`,subject,grade_level:'Kinder',is_active:true}));
 for(const [index,subject] of subjects.entries()) {
  const metadata={rawText:'Learning Area/s: Values Development\nGrade Level: Kinder'};
  const fileName=`KINDERGARTEN WK 7 ${subject}.pdf`;
  assert.equal(resolveTeachingLoadMatch(metadata,assigned,fileName).loadId,`area-${index}`,subject);
  assert.equal(inferUploadSubject(metadata,fileName),subject);
 }
});
const metadata={subject:'GMRC',gradeLevel:'1',rawText:'Learning Area/s: Mathematics\nGrade Level and Section: 5 - Rose'};

test('HGP uses the same-grade GMRC assignment when HGP is not assigned',()=>{
 const meta={rawText:'Learning Area: HGP\nGrade Level and Section: 1-Daffodil'};
 assert.equal(resolveTeachingLoadMatch(meta,loads).loadId,'gmrc1');
 assert.equal(validateSelection('gmrc1',meta.rawText,loads,meta),null);
 assert.equal(resolveTeachingLoadMatch({...meta,rawText:'Learning Area: HGP\nGrade Level: 3'},loads).loadId,null);
});

test('an active HGP assignment takes precedence and prevents GMRC fallback',()=>{
 const meta={rawText:'Learning Area: HGP\nGrade Level: 1'};
 const assigned=[...loads,{id:'hgp1',subject:'HGP',grade_level:'1'}];
 assert.equal(resolveTeachingLoadMatch(meta,assigned).loadId,'hgp1');
 assert.equal(validateSelection('gmrc1',meta.rawText,assigned,meta)?.type,'mismatch');
 assert.equal(resolveTeachingLoadMatch(meta,[...loads,{id:'inactive',subject:'HGP',grade_level:'1',is_active:false}]).loadId,'gmrc1');
});

test('HGP never guesses another subject or an unassigned grade',()=>{
 const meta={rawText:'Learning Area: HGP\nGrade Level: 1'};
 assert.equal(resolveTeachingLoadMatch(meta,loads.filter(l=>l.subject!=='GMRC')).loadId,null);
 assert.equal(resolveTeachingLoadMatch(meta,[{id:'bad',subject:'GMRC',grade_level:null}]).loadId,null);
 assert.equal(resolveTeachingLoadMatch(meta,[...loads,loads[0]]).reason,'ambiguous');
});
test('Math fields select Math Grade 5 even when stale metadata says GMRC Grade 1',()=>{
 const match=resolveTeachingLoadMatch(metadata,loads,'GMRC 1.pdf');assert.equal(match.loadId,'math5');
 assert.equal(validateSelection(match.loadId,metadata.rawText,loads,metadata,'GMRC 1.pdf'),null);
});
test('Tagalog fields identify Asignatura and Baitang at Seksyon',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Asignatura: Matematika\nBaitang at Seksyon: V - Mabini'},loads).loadId,'math5');
});
test('inline PDF table fields identify the same Math load',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s Mathematics Grade Level and Section 5 - Rose'},loads).loadId,'math5');
});
test('a filename and lesson body cannot select a teaching load',()=>{
 assert.equal(resolveTeachingLoadMatch({subject:'Mathematics',gradeLevel:'5',rawText:'Mathematics Grade 5 exercises'},loads,'Math Grade 5.pdf').loadId,null);
});
test('both named fields are required even if only one Math load exists',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: Mathematics'},loads.slice(0,2)).reason,'missing_grade');
 assert.equal(resolveTeachingLoadMatch({rawText:'Grade Level and Section: 5-Rose'},loads).loadId,null);
});
test('no matching active Math load leaves selection empty',()=>{
 assert.equal(resolveTeachingLoadMatch(metadata,[loads[0]]).loadId,null);
});
test('a Math load with the wrong grade cannot be auto-selected',()=>{
 assert.equal(resolveTeachingLoadMatch(metadata,loads.slice(0,2)).reason,'grade_mismatch');
});
test('duplicate same-subject same-grade loads require a manual choice',()=>{
 assert.equal(resolveTeachingLoadMatch(metadata,[...loads,{id:'duplicate',subject:'Mathematics',grade_level:'V'}]).reason,'ambiguous');
});
test('inactive loads are not auto-selected',()=>{
 assert.equal(resolveTeachingLoadMatch(metadata,loads.map(l=>({...l,is_active:l.id!=='math5'}))).loadId,null);
});
test('unrelated subjects and grade numbers outside the fields are ignored',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: GMRC\nGrade Level and Section: 1 - Rose\nIntegration: Mathematics Homeroom Guidance Grade 5'},loads,'Math 5.pdf').loadId,'gmrc1');
});
test('section digits cannot be mistaken for the grade',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area: Math\nGrade Level and Section: 1 - Section 5'},loads).loadId,'math1');
});
test('conflicting subject or grade fields require a choice',()=>{
 for(const text of ['Learning Area: Mathematics\nAsignatura: GMRC\nGrade Level: 5','Learning Area: Mathematics\nGrade Level: 1\nBaitang at Seksyon: 5']) assert.equal(resolveTeachingLoadMatch({rawText:text},loads).loadId,null);
});
test('common OCR label and subject misspellings can still match the fields',()=>{
 const fields=extractTeachingLoadFields('Learming Area: Mathematlcs\nGrade Level and Sectlon: 5 - Rose');
 assert.equal(fields.subject,'Mathematics');assert.equal(fields.grade,'5');
});
test('bilingual adjacent labels do not use the label itself as the value',()=>{
 assert.equal(resolveTeachingLoadMatch({rawText:'Learning Area/s / Asignatura: Mathematics\nGrade Level and Section / Baitang at Seksyon: V-Rose'},loads).loadId,'math5');
});
test('genuine manual subject and grade mismatches still warn',()=>{
 assert.match(validateSelection('gmrc1',metadata.rawText,loads,metadata).message,/Mathematics/);
 assert.match(validateSelection('math1',metadata.rawText,loads,metadata).message,/Grade 5/);
});
test('real OCR metadata parsing uses these fields and ignores a misleading filename',async()=>{
 const source=readFileSync('src/lib/utils/ocr.ts','utf8').replace("from './headerPeriod'",`from '${headerUrl}'`).replace("from './teachingLoadFields'",`from '${fieldsUrl}'`).replace("from './fuzzyClassifier'",`from '${fuzzyUrl}'`).replace("import { PDFJS_VERSION } from './pdfjsVersion';","const PDFJS_VERSION='3.4.120';");
 const {parseMetadata}=await import(url(source));
 const parsed=parseMetadata('DAILY LESSON LOG\nLearning Area/s: Mathematics\nGrade Level and Section: 5-Rose\nIntegration: GMRC Grade 1','GMRC 1.pdf');
 assert.equal(parsed.subject,'Mathematics');assert.equal(parsed.gradeLevel,'5');
 assert.equal(resolveTeachingLoadMatch(parsed,loads).loadId,'math5');
 const unknown=parseMetadata('DAILY LESSON LOG\nMathematics Grade 5 exercises','Math Grade 5.pdf');
 assert.equal(unknown.subject,null);assert.equal(unknown.gradeLevel,'5');
 assert.equal(resolveTeachingLoadMatch(unknown,loads).loadId,null);
});
for(const [index,roman] of ['I','II','III','IV','V','VI'].entries()) {
 const grade=String(index+1);
 test(`header Grade/Baitang ${grade} or ${roman} matches that subject and grade`,()=>{
  const roster=[{id:'wrong',subject:'GMRC',grade_level:`Grade ${grade}`},...Array.from({length:6},(_,i)=>({id:`math-${i+1}`,subject:'Mathematics',grade_level:`Grade ${i+1}`}))];
  for(const label of ['Grade','Baitang'])for(const value of [grade,roman]) {
   const rawText=`DAILY LESSON LOG\nAsignatura: Matematika\n${label}: ${value} - Rose`;
   assert.equal(resolveTeachingLoadMatch({rawText},roster).loadId,`math-${grade}`);
  }
 });
}
test('the grade token wins over section numbers and Roman section names',()=>{
 for(const value of ['V - Section 1','Grade V - Section 1','(V) - Room 1']) assert.equal(extractTeachingLoadFields(`Learning Area: Mathematics\nGrade: ${value}`).grade,'5');
 assert.equal(extractTeachingLoadFields('Learning Area: Mathematics\nBaitang: 1 - V').grade,'1');
});
test('grade mentions after the lesson-body heading do not affect the header',()=>{
 const text='Learning Area: Mathematics\nGrade: V\nI. OBJECTIVES\nReview Grade 1 and Baitang II materials';
 assert.equal(resolveTeachingLoadMatch({rawText:text},loads).loadId,'math5');
});
test('compact Grade5 and BaitangV labels match without a colon',()=>{
 for(const label of ['Grade5','BaitangV'])assert.equal(resolveTeachingLoadMatch({rawText:`Learning Area: Mathematics\n${label}`},loads).loadId,'math5');
});
test('unsupported grades and conflicting bare header grades are not guessed',()=>{
 for(const label of ['Grade 12','Baitang VII','Grade 1\nBaitang V'])assert.equal(resolveTeachingLoadMatch({rawText:`Learning Area: Mathematics\n${label}`},loads).loadId,null);
});
test('the shared fuzzy grade classifier reads the first grade token, not the section',async()=>{
 const {predictGradeLevel,predictGradeValue}=await import(fuzzyUrl);
 assert.equal(predictGradeValue('V - Section 1').value,'Grade 5');
 assert.equal(predictGradeLevel('Baitang: IV - Section 1').value,'Grade 4');
 assert.equal(predictGradeLevel('Grade Level and Section: V - Section 1').value,'Grade 5');
 assert.equal(predictGradeLevel('I. OBJECTIVES\nGrade 5 exercise').value,null);
});
test('the supplied Grade Level and Section / 3-Jasmine layout identifies Grade 3',()=>{
 const roster=[...loads,{id:'math3',subject:'Mathematics',grade_level:'Grade 3'}];
 for(const rawText of ['Learning Area/s: Mathematics\nGrade Level and Section\n3-Jasmine','Learning Area/s | Mathematics\nGrade Level and Section | 3-Jasmine','Learning Area/s Mathematics\n***Grade Level and Section***\n3-Jasmine']) assert.equal(resolveTeachingLoadMatch({rawText},roster).loadId,'math3');
});
test('the supplied Baitang at Seksyon / Baitang 1 Daffodil layout identifies Grade 1',()=>{
 const rawText='Asignatura: Matematika\nBaitang at Seksyon\tBaitang 1 \u2013 Daffodil';
 assert.equal(resolveTeachingLoadMatch({rawText},loads).loadId,'math1');
});
test('clear grade values work with missing section names and loose separators',()=>{
 const roster=[{id:'math3',subject:'Mathematics',grade_level:'3'}];
 for(const grade of ['3','3-','3Jasmine','• 3 - Jasmine','Grade 3 / Jasmine']) assert.equal(resolveTeachingLoadMatch({rawText:`Learning Area: Math\nGrade Level and Section: ${grade}`},roster).loadId,'math3');
});
test('incomplete or wrapped labels still associate the following grade value',()=>{
 for(const label of ['Grade Level Section','Grade Level and\n','Grade Level and\nSection']) assert.equal(extractTeachingLoadFields(`${label}\n3-Jasmine\nLearning Area: Mathematics`).grade,'3');
});
test('a repeated Baitang value keeps its full field priority over unrelated header grade mentions',()=>{
 const fields=extractTeachingLoadFields('Baitang at Seksyon\nBaitang 1 - Daffodil\nIntegration: Grade 5\nAsignatura: Matematika');assert.equal(fields.grade,'1');
});
test('a missing subject or unreadable grade still requires manual selection',()=>{
 for(const rawText of ['Grade Level and Section\n3-Jasmine','Learning Area: Mathematics\nGrade Level and Section\nJasmine','Learning Area: Mathematics\nGrade Level and Section\n35-Jasmine']) assert.equal(resolveTeachingLoadMatch({rawText},loads).loadId,null);
});
test('PDF table cells with different font baselines stay on the same visual row',async()=>{
 const source=readFileSync('src/lib/utils/ocr.ts','utf8').replace("from './headerPeriod'",`from '${headerUrl}'`).replace("from './teachingLoadFields'",`from '${fieldsUrl}'`).replace("from './fuzzyClassifier'",`from '${fuzzyUrl}'`).replace("import { PDFJS_VERSION } from './pdfjsVersion';","const PDFJS_VERSION='3.4.120';");
 const {textContentToLines,ocrBlocksToLines}=await import(url(source));
 const text=textContentToLines([{str:'Grade Level and Section',transform:[0,0,0,0,10,500],height:12},{str:'3-Jasmine',transform:[0,0,0,0,300,502],height:12},{str:'Learning Area/s',transform:[0,0,0,0,10,480],height:12},{str:'Mathematics',transform:[0,0,0,0,300,482],height:12}]);
 assert.equal(extractTeachingLoadFields(text).grade,'3');assert.equal(extractTeachingLoadFields(text).subject,'Mathematics');
 const word=(text,x,y)=>({text,bbox:{x0:x,y0:y-12,x1:x+100,y1:y}});
 const blocks=[{paragraphs:[{lines:[{words:[word('Grade Level and Section',10,30)]},{words:[word('Learning Area/s',10,60)]}]}]},{paragraphs:[{lines:[{words:[word('3-Jasmine',300,32)]},{words:[word('Mathematics',300,62)]}]}]}];
 const raster=ocrBlocksToLines(blocks,'unstructured fallback');assert.equal(extractTeachingLoadFields(raster).grade,'3');assert.equal(extractTeachingLoadFields(raster).subject,'Mathematics');
 assert.equal(ocrBlocksToLines(null,'existing text'),'existing text');
});
