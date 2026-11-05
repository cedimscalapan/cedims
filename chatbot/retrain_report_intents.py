"""Reproducible report-intent refresh. Uses questions only, never private database records."""
import ast, json
from pathlib import Path
from itertools import product
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

root=Path(__file__).resolve().parents[1]
training_path=root/'chatbot/train_intent_classifier.py'
training_source=training_path.read_text(encoding='utf-8')
tree=ast.parse(training_source)
# Preserve the existing multilingual/template dataset as well as its seed questions.
boundary=next(node.lineno for node in tree.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='df' for t in node.targets))
namespace={'__file__':str(training_path),'__name__':'report_dataset'}
exec(compile('\n'.join(training_source.splitlines()[:boundary-1]),str(training_path),'exec'),namespace)
seed=namespace['TRAINING_DATA']
scopes=['this week','this term','week 7 term 2','Mathematics this week','Filipino for Grade 2','Science in Bulusan Elementary School','all schools in my district','Salong Elementary School this term','Calapan East District','last week','this school year','GMRC week 5','HGP this term','my own submissions']
templates=['Prepare a report for {scope}.','Write a narrative report about {scope}.','Summarize compliance for {scope} in complete sentences.','Give me a bullet report for {scope}.','Export an Excel report for {scope}.','Create a Word document report for {scope}.','Make an xlsx compliance report for {scope}.','Put the {scope} report in a docx file.','Gumawa ng ulat para sa {scope}.','Paki report ang {scope} sa pangungusap.','Gawan ng Excel report ang {scope}.','Gusto ko ng Word na ulat para sa {scope}.','Can I have a detailed submission report for {scope}?','Generate a report for {scope} with on-time, late, missing, and leave totals.','Please create both Word and Excel reports for {scope}.','Show a report for {scope} here in chat.','Create a sentneces reprot for {scope}.','Can you make a compliance summary for {scope}?']
added=[{'text':template.format(scope=scope),'intent':'create_report'} for template,scope in product(templates,scopes)]
added += [{'text':q,'intent':'create_report'} for q in ['Same report but in Word','Export that to Excel','Make it bullets instead','Now for week 6','What about term 3?','Gawin mong Word file','Sa Excel naman','For another subject: English','For the whole district instead','Give me a report ngayong linggo','Ulat para sa kasalukuyang termino','Report para sa paaralan namin']]
upload_scopes=['week 7','week 6 term 2','this week','this term','Mathematics week 7','Filipino in my school','my district this week','Bulusan Elementary School week 7','this school year']
upload_templates=['{scope} total uploaded documents','How many files were uploaded for {scope}?','Count all uploads for {scope}, including supplementary files.','Ilan ang na-upload na dokumento sa {scope}?','Total compliant uploaded files for {scope}','How many late uploads for {scope}?','Count supplementary uploads for {scope}','{scope} missing or overdue requirements count','{scope} total uploads by status','How many teachers uploaded documents for {scope}?','Show the upload count per school for {scope}','{scope} document count, not upload instructions']
upload_added=[{'text':t.format(scope=s),'intent':'ask_compliance'} for t,s in product(upload_templates,upload_scopes)]
added.extend(upload_added)
dedup={row['text'].strip().lower():row for row in seed+added}
rows=list(dedup.values())
x=[r['text'].strip().lower() for r in rows]; y=[r['intent'] for r in rows]
xtrain,xtest,ytrain,ytest=train_test_split(x,y,test_size=.2,random_state=42,stratify=y)
vector=CountVectorizer(analyzer='char',ngram_range=(2,5),min_df=2,max_features=11000,lowercase=True)
train=vector.fit_transform(xtrain)
classifier=LogisticRegression(C=1,solver='lbfgs',max_iter=1200,class_weight='balanced',random_state=42)
classifier.fit(train,ytrain)
pred=classifier.predict(vector.transform(xtest))
evaluation={'evaluation':'Seeded stratified 20% question holdout; measures intent recognition, not report factual accuracy.','n_samples':len(rows),'added_report_questions':len(added)-len(upload_added),'added_upload_count_questions':len(upload_added),'test_accuracy':round(accuracy_score(ytest,pred)*100,2),'per_intent':classification_report(ytest,pred,output_dict=True,zero_division=0)}
# Deploy a model fit on all reviewed examples after evaluating the held-out split.
full_vector=CountVectorizer(analyzer='char',ngram_range=(2,5),min_df=2,max_features=11000,lowercase=True)
full=full_vector.fit_transform(x)
classifier.fit(full,y)
vocab=full_vector.get_feature_names_out().tolist()
model={'version':'4.1.0-live-data-questions','intents':classifier.classes_.tolist(),'vocabulary':{w:i for i,w in enumerate(vocab)},'coefficients':{name:{w:float(classifier.coef_[i][j]) for j,w in enumerate(vocab)} for i,name in enumerate(classifier.classes_)},'intercepts':{name:float(classifier.intercept_[i]) for i,name in enumerate(classifier.classes_)},'classes_':classifier.classes_.tolist(),'training_metrics':evaluation}
(root/'src/lib/models/intent_classifier_model.json').write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'chatbot/results/report_intent_training_results.json').write_text(json.dumps(evaluation,ensure_ascii=False,indent=2),encoding='utf-8')
(root/'chatbot/report_training_questions.json').write_text(json.dumps(added,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in evaluation.items() if k!='per_intent'},indent=2))
