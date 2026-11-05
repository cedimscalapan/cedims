# Gabay report requests

Gabay creates a current snapshot of weekly lesson-plan requirements. No private records are used in classifier training. Report facts are calculated from live, authorized CEDIMS records.

## Examples

- Write a report for this week in complete sentences.
- Gumawa ng ulat ngayong linggo sa pangungusap.
- Create a bullet report for Term 2, Week 7, Mathematics, Grade 3.
- Report for Bulusan Elementary School this term.
- Create an Excel report for my district for Term 2.
- Create a narrative Word report for Science, Term 2, Week 7.
- Same report but in Word.
- Same report for all subjects.
- Now for Term 3.

Chat is the default output. Excel produces an `.xlsx` summary and requirement-level records. Word produces a `.docx` narrative, including all school and subject summaries, rather than a table-only export. Request both formats to download both. A follow-up format change preserves the selected filters; an explicitly new report starts a new selection.

## Conversational counts and status questions

“Week 7 total uploaded documents” is a database aggregation, not an upload-help request. Gabay plans the operation and measurement before the general classifier or help responses run. It counts saved uploads, including supplementary lesson plans and administrative ISP/ISR records, while excluding missing placeholders and queued files. Scope and academic-period rules remain enforced.

- “Week 7 total uploaded documents” — all confirmed saved files in the permitted scope.
- “Week 7 late uploads” / “count compliant uploads” / “supplementary uploads count” — status-filtered saved files.
- “Week 7 total uploads by status” — saved-file counts plus a separately labeled requirement summary.
- “Week 7 missing” / “how many overdue requirements?” — due, unsubmitted requirements, excluding approved leave; pending leave remains expected.
- “How many teachers uploaded?” — distinct uploaders, not document count.
- “What about week 6?”, “Explain that count”, “Same count in Word” — retain the original scope, measurement, and document-type filters.

Missing/overdue work is not an uploaded file. A database error produces an explicit failure message rather than a fabricated count. Responses are composed from current query results; the local classifier does not act as a general-purpose language reasoning model.

## Scope and calculations

- Teacher: own records. Master Teacher and School Head: their school. District Supervisor: assigned district. Admin: records visible under existing database permissions.
- A named school or district must be available within that scope. Missing assignments, ambiguous current periods, unknown schools, unavailable data, and incomplete reads produce clarification or an error rather than invented totals.
- “This week” means the academic period whose deadline falls in the current Philippine Monday–Sunday week. “This term” uses that period's term. An ambiguous numbered week requires its term.
- Expected work comes from active teaching loads and scoped calendar requirements, including historical closed periods. Approved leave reduces expected work; pending leave remains expected. Supplementary copies do not double count.
- The report distinguishes on-time, late, overdue missing, upcoming, approved/pending leave, checked, and for-checking work. Overall completion and due-only completion use their respective denominators. Zero denominators display N/A.
- Shared document-review status is authoritative. An empty remark does not undo a checked status.
- Queries filter by permitted schools, teachers, teaching loads, academic year, and period before loading detailed records. Reads paginate; exceeding the completeness limit asks for a narrower report.

## Training and validation

Run `python chatbot/retrain_report_intents.py` to preserve the existing multilingual dataset and add the questions in `chatbot/report_training_questions.json`. A seeded 20% question holdout is evaluated before fitting the deployed classifier to all examples. See `chatbot/results/report_intent_training_results.json` for results. Synthetic/template holdout scores measure intent recognition and do not prove factual accuracy of generated reports.

Run `node --test tests/chatReports.test.mjs tests/systemHelp.test.mjs` and `npm run check`. Tests cover filters and follow-ups, Philippine academic periods, role boundaries, approval exclusions, supplementary copies, pagination/errors, and the actual Word/Excel contents.
