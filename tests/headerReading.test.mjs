import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const read = name => readFileSync(`src/lib/utils/${name}.ts`, 'utf8');
const fuzzyUrl = url(read('fuzzyClassifier'));
const fieldsUrl = url(read('teachingLoadFields').replace("from './fuzzyClassifier'", `from '${fuzzyUrl}'`));
const deadlineUrl = url(read('deadlineRules'));
const headerUrl = url(read('headerPeriod').replace("from './deadlineRules'", `from '${deadlineUrl}'`).replace("from './fuzzyClassifier'", `from '${fuzzyUrl}'`));
const matcherUrl = url(read('teachingLoadMatching').replace("from './teachingLoadFields'", `from '${fieldsUrl}'`));
const { extractTeachingLoadFields: fields } = await import(fieldsUrl);
const { readHeaderPeriod: period, resolveHeaderUploadPeriod, fileNameAsHeaderText } = await import(headerUrl);
const { resolveTeachingLoadMatch } = await import(matcherUrl);
const { predictDocType, predictGradeValue, wordNumber } = await import(fuzzyUrl);
const { parseMetadata } = await import(url(read('ocr')
    .replace("from './headerPeriod'", `from '${headerUrl}'`).replace("from './teachingLoadFields'", `from '${fieldsUrl}'`)
    .replace("from './fuzzyClassifier'", `from '${fuzzyUrl}'`).replace("import { PDFJS_VERSION } from './pdfjsVersion';", "const PDFJS_VERSION='3.4.120';")));

const table = (name, rows, read) => test(name, () => {
    const wrong = rows.filter(([text, want]) => String(read(text)) !== String(want)).map(([text, want]) => `${JSON.stringify(text)} should be ${want}, got ${read(text)}`);
    assert.deepEqual(wrong, []);
});

table('subjects read in English, Tagalog, shorthand and misspelled', [
    ['Learning Area: Mathematics', 'Mathematics'], ['Subject: Math', 'Mathematics'], ['Subject Area: Maths', 'Mathematics'],
    ['Learing Aera: Math', 'Mathematics'], ['Lerning Area Mathematics', 'Mathematics'], ['Learning Area: Mathemtics', 'Mathematics'],
    ['Asignatura: Matematika', 'Mathematics'], ['Asigantura: Matematika', 'Mathematics'], ['Asignatura: Matimatika', 'Mathematics'], ['Asignaturang Matematika', 'Mathematics'],
    ['Asignatura: Agham', 'Science'], ['Learning Area: Scince', 'Science'], ['Asignatura: Ingles', 'English'], ['Learning Area: Englsh', 'English'], ['Asignatura: Filipno', 'Filipino'],
    ['Asignatura: Araling Panlipunan', 'AP'], ['Learning Area: Araling Panlipunan 5', 'AP'], ['Learning Area: Social Studies', 'AP'], ['Asignatura: AP', 'AP'],
    ['Learning Area: G.M.R.C.', 'GMRC'], ['Learning Area: Good Manners and Right Conduct', 'GMRC'], ['Asignatura: Edukasyon sa Pagpapakatao', 'GMRC'], ['Asignatura: EsP', 'GMRC'], ['Asignatura: Kagandahang Asal', 'GMRC'],
    ['Learning Area: Mapeh', 'MAPEH'], ['Asignatura: Musika, Sining, Edukasyong Pangkatawan at Kalusugan', 'MAPEH'], ['Learning Area: Music, Arts, PE and Health', 'MAPEH'],
    ['Learning Area: Makabnsa', 'Makabansa'], ['Learning Area: Homeroom Guidance', 'HGP'], ['Learning Area: H.G.P', 'HGP'], ['Asignatura: Patnubay sa Silid', 'HGP'],
    ['Learning Area: EPP', 'EPP/TLE'], ['Learning Area: TLE', 'EPP/TLE'], ['Learning Area: EPP/TLE', 'EPP/TLE'], ['Asignatura: Edukasyong Pantahanan at Pangkabuhayan', 'EPP/TLE'],
    ['Learning Area: Reading and Literacy', 'Reading and Literacy'], ['Asignatura: Pagbasa at Literasi', 'Reading and Literacy'], ['Asignatura: Wika', 'Language'],
    ['Learning Area: Cognitve Developmnt', 'Cognitive Development'],
], text => fields(text).subject);

table('subjects read from a title line when the label is missing', [
    ['GRADE 6 MATHEMATICS', 'Mathematics'], ['MATH 6', 'Mathematics'], ['Matematika 5', 'Mathematics'], ['DAILY LESSON LOG - ENGLISH', 'English'],
    ['DAILY LESSON LOG IN SCIENCE 5', 'Science'], ['BANGHAY ARALIN SA FILIPINO 3', 'Filipino'], ['Banghay Aralin sa Matematika', 'Mathematics'],
], text => fields(text).subject);

table('grades read in every form', [
    ['Grade Level: 6', '6'], ['Grade 6', '6'], ['Gr. 6', '6'], ['Gr 6', '6'], ['G6', '6'], ['G-6', '6'], ['Grade VI', '6'], ['Grade Six', '6'], ['Sixth Grade', '6'], ['6th Grade', '6'],
    ['Grde 6', '6'], ['Grade Levl: 6', '6'], ['Grade & Section: 6-Rose', '6'], ['Gr/Sec: 6-Rose', '6'], ['Grade and Sec.: 6 Rose', '6'], ['Yr & Sec: 6-Rose', '6'],
    ['Baitang: 6', '6'], ['Baitang 6', '6'], ['Baitang Anim', '6'], ['Baitang: Ikaanim', '6'], ['Ikaanim na Baitang', '6'], ['Ika-6 na Baitang', '6'], ['Baitang at Seksiyon: VI-Rosal', '6'],
    ['Baitang/Seksiyon: 6', '6'], ['Baitang at Pangkat: 6-Rosal', '6'], ['Baytang: 6', '6'], ['Antas: 6', '6'], ['Baitang/Antas: V', '5'], ['MATH 6', '6'], ['Filipino III', '3'],
    ['Grade Level: Kinder', 'Kinder'], ['Kindergarten', 'Kinder'], ['Baitang: Kinder', 'Kinder'],
], text => fields(text).grade);

table('terms read in every form', [
    ['Term 2', 2], ['Term: 2', 2], ['Term II', 2], ['Term Two', 2], ['2nd Term', 2], ['Second Term', 2], ['Trimester 2', 2], ['Second Trimester', 2], ['Tri 2', 2],
    ['Terrn 2', 2], ['Trm 2', 2], ['Ikalawang Markahan', 2], ['Markahan 2', 2], ['Markahan: Ikalawa', 2], ['Ikalawang Termino', 2], ['Termino 2', 2], ['Ika-2 Termino', 2], ['Ika-2 Markahan', 2],
    ['Ikalawang Trimestre', 2], ['Pangalawang Markahan', 2], ['Quarter 2', 2], ['2nd Quarter', 2], ['Q2', 2], ['Marakahan 2', 2], ['Second Grading', 2], ['Unang Markahan', 1], ['Ikatlong Termino', 3],
    ['T2', 2], ['T2W7', 2], ['Term/Week: 2/7', 2],
], text => period(text).termNumber);

table('weeks read in every form', [
    ['Week 7', 7], ['Week: 7', 7], ['Week No. 7', 7], ['Wk 7', 7], ['WK7', 7], ['Wk. 7', 7], ['W7', 7], ['Week VII', 7], ['Week Seven', 7], ['Seventh Week', 7], ['7th Week', 7],
    ['Weel 7', 7], ['Wek 7', 7], ['Linggo 7', 7], ['Linggo Blg. 7', 7], ['Ika-7 Linggo', 7], ['Ika 7 na Linggo', 7], ['Ikapitong Linggo', 7], ['Ika-pitong Linggo', 7], ['Lingo 7', 7],
    ['Linggo: Ikapito', 7], ['T2W7', 7], ['Q2 W7', 7], ['Week 7 Day 1', 7], ['Term/Week: 2/7', 7], ['Term 2 Week Seven', 7], ['Week 12', 12], ['Ikalabindalawang Linggo', 12],
], text => period(text).weekNumber);

table('days read in English and Tagalog', [
    ['Monday', 'Monday'], ['Lunes', 'Monday'], ['Martes', 'Tuesday'], ['Miyerkules', 'Wednesday'], ['Miyerkoles', 'Wednesday'], ['Mierkules', 'Wednesday'], ['Huwebes', 'Thursday'], ['Biyernes', 'Friday'],
    ['Byernes', 'Friday'], ['Wednesay', 'Wednesday'], ['Thurday', 'Thursday'], ['Monday to Friday', 'Monday to Friday'], ['Lunes - Biyernes', 'Monday to Friday'],
], text => period(text).day);

table('day numbers read in English and Tagalog', [
    ['Day 1', 1], ['DAY 3', 3], ['Araw 2', 2], ['Unang Araw', 1], ['Ika-2 Araw', 2], ['Ikatlong Araw', 3], ['Day One', 1], ['Week 7 Day 4', 4],
], text => period(text).dayNumber);

table('dates read with Tagalog months, shorthand and day-first order', [
    ['Petsa: Oktubre 25, 2026', '10-25'], ['Oktubre 25-29, 2026', '10-25'], ['Nobyembre 2, 2026', '11-2'], ['25 October 2026', '10-25'], ['Sept. 7, 2026', '9-7'], ['Setyembre 7-11, 2026', '9-7'],
    ['Enero 4, 2027', '1-4'], ['Disyembre 7, 2026', '12-7'], ['Nov. 2-6, 2026', '11-2'], ['November 2 to 6, 2026', '11-2'], ['Novenber 2, 2026', '11-2'], ['Oktubr 25, 2026', '10-25'],
], text => { const start = period(text).ranges[0]?.start; return start ? `${start.month}-${start.day}` : null; });

test('words that only look like labels are not read as values', () => {
    assert.equal(fields('Teacher: Grace V. Santos').grade, '');
    assert.equal(fields('Learning Area: Mathematics\nGrade Level Coordinator: V. Santos\nGrade Level: 2').grade, '2');
    assert.equal(fields('Subject Matter: Fractions in Science').subject, null);
    assert.equal(fields('Learning Area: Mathematics\nSubject Matter: Plants in Science\nSubject Teacher: Science').subject, 'Mathematics');
    assert.equal(period('Position: T-1').termNumber, null);
    assert.equal(period('Teacher I\nPosition: T-1\nTerm 2').termNumber, 2);
    assert.equal(period('Team 2').termNumber, null);
    assert.equal(period('Weekly Lesson Log').weekNumber, null);
    assert.equal(period('Term Paper').termNumber, null);
    assert.equal(period('Lines 7').day, null);
    assert.equal(period('Second Term Third Week').termNumber, 2);
    assert.equal(period('Second Term Third Week').weekNumber, 3);
    assert.equal(period('Week Seven Term 2').termNumber, 2);
    assert.equal(period('Grade 5 Term 2').termNumber, 2);
});

test('a word containing ISP or ISR does not change the document type', () => {
    assert.equal(predictDocType('Learning Area: Mathematics\nDisplay the chart on the board').value, null);
    assert.equal(predictDocType('Israel and misread words').value, null);
    assert.equal(parseMetadata('Learning Area: Math\nGrade 5\nDisplay the chart', 'lesson.pdf').docType === 'ISP', false);
    assert.equal(predictDocType('Instructional Supervisory Plan').value, 'ISP');
    assert.equal(predictDocType('ISR for Term 2').value, 'ISR');
    assert.equal(predictDocType('DALY LESON LOG').value, 'DLL');
    assert.equal(predictDocType('Banghay Aralin').value, 'DLL');
});

test('conflicts and impossible values stay empty rather than guessing', () => {
    assert.equal(fields('Learning Area: Mathematics\nAsignatura: Agham').subject, null);
    assert.equal(fields('Learning Area: Math and Science').subject, null);
    assert.equal(fields('Grade 7').grade, '');
    assert.equal(fields('Grade 1\nGrade 5').grade, '');
    assert.equal(period('Term 1\nTerm 2').termNumber, null);
    assert.equal(period('Week 7\nWeek 8').weekNumber, null);
    assert.equal(period('Term 4').invalid, true);
    assert.equal(predictGradeValue('Rose').value, null);
    assert.equal(wordNumber('banana'), null);
    assert.equal(wordNumber('ikapitong'), 7);
    assert.equal(wordNumber('Ika-7'), 7);
});

const year = '2026-2027';
const week = (id, term, number, date, active = true) => ({ id, term, week_number: number, deadline_date: date, is_active: active, school_year: year });
const loads = [{ id: 'math5', subject: 'Mathematics', grade_level: 'Grade 5' }, { id: 'math6', subject: 'Mathematics', grade_level: 'Grade 6' }, { id: 'sci5', subject: 'Science', grade_level: 'Grade 5' }, { id: 'ap5', subject: 'Araling Panlipunan', grade_level: 'Grade 5' }, { id: 'epp5', subject: 'EPP/TLE', grade_level: 'Grade 5' }];

test('a full Tagalog header fills everything', () => {
    const text = 'PANG-ARAW-ARAW NA TALA NG PAGTUTURO\nPaaralan: Ibaba Elementary School   Baitang/Antas: VI\nGuro: Maria V. Cruz   Asignatura: Matematika\nPetsa: Oktubre 26-30, 2026   Markahan: Ikalawa\nIkapitong Linggo\nUnang Araw, Lunes\nI. LAYUNIN\nWeek 9 review ng Agham';
    const meta = parseMetadata(text, 'file.pdf');
    assert.deepEqual([meta.docType, meta.subject, meta.gradeLevel, meta.termNumber, meta.weekNumber, meta.day, meta.dayNumber], ['DLL', 'Mathematics', '6', 2, 7, 'Monday', 1]);
    assert.equal(resolveTeachingLoadMatch(meta, loads).loadId, 'math6');
});

test('a full English header with table separators fills everything', () => {
    const text = 'DAILY LESSON LOG\nSchool | Bulusan Elementary School | Grade Level | V\nTeacher | Juan Reyes | Learning Area | Science\nTeaching Dates and Time | November 2-6, 2026 | Quarter | 2nd Quarter\nWeek No. 8';
    const meta = parseMetadata(text, 'file.pdf');
    assert.deepEqual([meta.subject, meta.gradeLevel, meta.termNumber, meta.weekNumber], ['Science', '5', 2, 8]);
    assert.equal(resolveTeachingLoadMatch(meta, loads).loadId, 'sci5');
});

test('a header with no title and misspelled labels still fills in', () => {
    const meta = parseMetadata('Learing Aera: Araling Panlipnan\nBaytang: Lima\nTrm 2\nWek 7', 'scan.pdf');
    assert.deepEqual([meta.subject, meta.gradeLevel, meta.termNumber, meta.weekNumber], ['AP', '5', 2, 7]);
    assert.equal(resolveTeachingLoadMatch(meta, loads).loadId, 'ap5');
});

test('the curriculum names EPP/TLE and Araling Panlipunan match their assigned loads', () => {
    for (const rawText of ['Learning Area: EPP\nGrade 5', 'Learning Area: TLE\nGrade 5', 'Asignatura: Edukasyong Pantahanan at Pangkabuhayan\nBaitang 5', 'Learning Area: EPP/TLE\nGrade 5']) {
        assert.equal(resolveTeachingLoadMatch({ rawText }, loads).loadId, 'epp5', rawText);
    }
});

test('a missing part is filled only when one Open period fits', () => {
    const calendar = [week('t1w7', 1, 7, '2026-08-31T02:00:00Z', false), week('t2w7', 2, 7, '2026-10-26T02:00:00Z'), week('t2w8', 2, 8, '2026-11-02T02:00:00Z', false)];
    const resolve = (text, rows = calendar) => resolveHeaderUploadPeriod(text, rows, { schoolYear: year, subject: 'Mathematics' })?.id ?? null;
    assert.equal(resolve('Week 7'), 't2w7', 'week without a term, and only Term 2 is Open');
    assert.equal(resolve('Ikalawang Markahan'), 't2w7', 'term without a week, and one week is Open');
    assert.equal(resolve('Oktubre 25, 2026'), 't2w7', 'only a Tagalog date');
    assert.equal(resolve('Term 2'), 't2w7');
    assert.equal(resolve('Week 7', [week('a', 1, 7, '2026-08-31T02:00:00Z'), week('b', 2, 7, '2026-10-26T02:00:00Z')]), null, 'two Open matches are never guessed');
    assert.equal(resolve('Term 2 Week 8'), null, 'a Closed week is never redirected');
    assert.equal(resolve('Learning Area: Math'), null, 'nothing about the period at all');
});

table('periods read from real file name styles', [
    ['WEEK 7 TERM 2 MATH G6.pdf', '2/7'], ['KINDERGARTEN WK 7 DAY 1 MATHEMATICS (1).pdf', 'null/7'], ['T2W7_MATH_G6.pdf', '2/7'], ['TERM2WEEK7_final.pdf', '2/7'],
    ['Math_G6_Q2_W7.pdf', '2/7'], ['Ikalawang Markahan Ikapitong Linggo Matematika.pdf', '2/7'], ['2nd Term Week 8.pdf', '2/8'], ['Math 6 Lesson.pdf', 'null/null'],
], name => { const found = period(fileNameAsHeaderText(name)); return `${found.termNumber}/${found.weekNumber}`; });
