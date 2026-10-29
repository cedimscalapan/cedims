import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';

const P={navy:'#123B63',deep:'#091B2F',blue:'#1E40AF',gold:'#F2B705',canvas:'#F5F7FA',ink:'#172B3F',muted:'#536779'};
const font='Segoe UI, Roboto, Arial, sans-serif';
const cut=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>1-Math.pow(1-cut(n),3);

type Focus={x:number;y:number;w:number;h:number;label:string};
type ScreenProps={src:string;number:string;kicker:string;title:string;note:string;durationSec:number;dark?:boolean;cropY?:number;focus?:Focus};
function ScreenScene({src,number,kicker,title,note,durationSec,dark=false,cropY=0,focus}:ScreenProps){
 const f=useCurrentFrame(),{fps}=useVideoConfig();
 const enter=ease(f/13),line=ease((f-12)/18),exit=1-ease((f-(durationSec*fps-11))/11);
 const move=ease((f-20)/(durationSec*fps-39));
 const zoom=1+0.24*move;
 const fx=focus ? focus.x+focus.w/2 : 855;
 const fy=focus ? focus.y+focus.h/2+cropY : 364;
 const panX=(855-fx)*0.22*move, panY=(364-fy)*0.22*move;
 const trace=ease((f-17)/20);
 const fg=dark?'#fff':P.ink, bg=dark?P.deep:P.canvas;
 return <AbsoluteFill style={{background:bg,fontFamily:font,overflow:'hidden'}}>
  <div style={{position:'absolute',left:105,top:45,fontSize:18,fontWeight:800,letterSpacing:5,color:P.gold}}>{number} / {kicker}</div>
  <div style={{position:'absolute',left:105,top:77,fontSize:56,fontWeight:800,letterSpacing:-1.5,color:fg,opacity:enter,transform:`translateY(${(1-enter)*25}px)`}}>{title}</div>
  <div style={{position:'absolute',right:105,top:104,fontSize:21,color:dark?'#B8C8D6':P.muted,textAlign:'right'}}>{note}</div>
  <div style={{position:'absolute',left:105,top:158,width:1710,height:3,background:dark?'#ffffff25':'#cad7e1'}}/>
  <div style={{position:'absolute',left:105,top:158,width:1710*interpolate(f,[0,durationSec*fps],[0,1],{extrapolateRight:'clamp'}),height:3,background:P.gold}}/>
  <div style={{position:'absolute',left:105,top:192,width:1710,height:728,overflow:'hidden',border:dark?'1px solid #35516d':'1px solid #d8e2eb',boxShadow:dark?'0 28px 70px #0008':'0 28px 70px #123B632c',opacity:enter*exit,transform:`translate(${(1-enter)*(number==='01'?100:-100)}px,${(1-enter)*34}px)`,transformOrigin:'center center'}}>
   <div style={{position:'absolute',inset:0,transform:`translate(${panX}px,${panY}px) scale(${zoom})`,transformOrigin:`${fx}px ${fy}px`}}>
    <Img src={staticFile(src)} style={{position:'absolute',left:0,top:cropY,width:1710,height:1004,maxWidth:'none',objectFit:'fill'}}/>
    {focus&&<div style={{position:'absolute',left:focus.x,top:focus.y+cropY,width:focus.w*trace,height:focus.h,borderTop:`3px solid ${P.gold}`,borderBottom:`3px solid ${P.gold}`,opacity:line,boxShadow:'0 0 0 999px #081a301c',pointerEvents:'none'}}/>}
   </div>
   {focus&&<div style={{position:'absolute',left:Math.min(1450,focus.x),top:Math.max(12,focus.y+cropY-47),background:P.gold,color:P.deep,fontSize:17,fontWeight:800,padding:'8px 14px',opacity:line,letterSpacing:1,transform:`translateY(${(1-line)*-12}px)`}}>{focus.label}</div>}
   {number==='02'&&<div style={{position:'absolute',left:255,bottom:62,display:'flex',gap:26}}>{['SELECT PDF','UPLOAD','TRACK STATUS'].map((step,i)=><div key={step} style={{border:'1px solid #F2B705',background:'#102b49e8',color:'#fff',fontSize:22,fontWeight:750,letterSpacing:2,padding:'16px 24px',opacity:ease((f-30-i*12)/10),transform:`translateX(${(1-ease((f-30-i*12)/10))*36}px)`}}><span style={{color:P.gold,marginRight:15}}>0{i+1}</span>{step}</div>)}</div>}
  </div>
  <div style={{position:'absolute',left:105,top:938,width:1710,display:'flex',alignItems:'center',gap:16}}><div style={{height:4,width:90,background:P.gold}}/><div style={{height:1,flex:1,background:dark?'#ffffff35':'#c5d1dc'}}/><span style={{fontSize:17,color:dark?'#94a9bc':P.muted,fontWeight:700}}>SMART-E VISION / CEDIMS</span></div>
 </AbsoluteFill>
}

function Opening(){
 const f=useCurrentFrame(),{fps}=useVideoConfig();
 const labels=['FILES','MESSAGES','DEADLINES','FOLLOW-UPS','RECORDS','REVIEWS'];
 return <AbsoluteFill style={{background:P.deep,fontFamily:font,overflow:'hidden'}}>
  <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(#ffffff0a 1px, transparent 1px), linear-gradient(90deg,#ffffff0a 1px,transparent 1px)',backgroundSize:'110px 110px'}}/>
  {labels.map((t,i)=>{const a=i*1.047;const radius=180+((i%3)*115);const drift=f/(fps*7);const x=960+Math.cos(a+drift*.9)*radius*2;const y=420+Math.sin(a+drift*.7)*radius;return <div key={t} style={{position:'absolute',left:x,top:y,border:'1px solid #7891aa80',background:'#102b49',padding:'18px 26px',color:'#d8e7f4',fontSize:18,letterSpacing:3,opacity:ease((f-i*5)/18),transform:`translateY(${Math.sin(f/16+i)*8}px)`}}>{t}</div>})}
  <div style={{position:'absolute',left:105,top:90,color:P.gold,fontSize:18,fontWeight:800,letterSpacing:5}}>INSTRUCTIONAL RECORDS / CALAPAN EAST</div>
  <div style={{position:'absolute',left:105,bottom:180,color:'white',fontSize:78,fontWeight:800,lineHeight:1.05,letterSpacing:-2.5}}>When records are scattered,<br/><span style={{color:'#a9c1d8'}}>progress is harder to see.</span></div>
  <div style={{position:'absolute',left:105,bottom:132,width:480,height:7,background:P.gold}}/>
 </AbsoluteFill>
}

function BrandScene({closing=false}:{closing?:boolean}){
 const f=useCurrentFrame(),a=ease(f/20);
 return <AbsoluteFill style={{background:closing?P.navy:P.canvas,fontFamily:font,overflow:'hidden'}}>
  <div style={{position:'absolute',left:0,top:0,bottom:0,width:50,background:P.gold,transform:`translateX(${(1-a)*-50}px)`}}/>
  <div style={{position:'absolute',left:155,right:155,top:200,height:1,background:closing?'#ffffff35':'#c7d3dd'}}/>
  <Img src={staticFile(closing?'brand/cedims-lockup-horizontal-reverse.svg':'brand/cedims-lockup-horizontal.svg')} style={{position:'absolute',left:530,top:305,width:860,height:280,objectFit:'contain',opacity:a}}/>
  <div style={{position:'absolute',left:155,right:155,top:670,textAlign:'center',fontSize:closing?55:49,fontWeight:750,color:closing?'#fff':P.navy,letterSpacing:-1.5,opacity:ease((f-10)/22)}}>{closing?'Clear records. Shared responsibility.':'One shared instructional record.'}</div>
  <div style={{position:'absolute',left:760,top:775,width:400*ease((f-18)/18),height:6,background:P.gold}}/>
 </AbsoluteFill>
}

const captions=[
 [0,4,'Instructional records move through many hands.'],
 [4,8,'Each week brings teaching loads, lesson plans, deadlines, and follow-ups.'],
 [8,13,'When these pieces are scattered, it takes longer to see what is complete,'],
 [13,17,'what still needs attention, and where support is needed.'],
 [17,22,'CEDIMS brings the work into one shared view for Calapan East District.'],
 [22,27,'Teachers begin with assigned subjects, upload documents, and see each status.'],
 [27,31,'A calendar keeps upcoming weeks visible.'],
 [31,37,'School leaders review progress across their school; district supervisors see five schools.'],
 [37,43,'They can open the archive, follow a school folder, and examine trends.'],
 [43,49,'The path from classroom record to district insight stays connected.'],
 [49,55,'Less searching, clearer follow-up, and more confident decisions.'],
 [55,60,'CEDIMS. Clear records. Shared responsibility.'],
] as const;

export const Film:React.FC=()=>{
 const f=useCurrentFrame(),{fps}=useVideoConfig();
 const caption=captions.find(([a,b])=>f>=a*fps&&f<b*fps)?.[2];
 return <AbsoluteFill style={{fontFamily:font,background:P.deep}}>
  <Audio src={staticFile('voice.wav')} volume={1}/>
  <Audio src={staticFile('score.wav')} volume={0.28}/>
  <Sequence durationInFrames={7*fps} premountFor={fps}><Opening/></Sequence>
  <Sequence from={7*fps} durationInFrames={5*fps} premountFor={fps}><BrandScene/></Sequence>
  <Sequence from={12*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/teacher-loads.jpg" number="01" kicker="PREPARE" title="Start with the teaching load" note="Teacher view · actual application" dark focus={{x:268,y:195,w:406,h:250,label:'ASSIGNED SUBJECT'}}/></Sequence>
  <Sequence from={17*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/teacher-upload.jpg" number="02" kicker="SUBMIT" title="A clear place to upload" note="Daily Lesson Plan · actual application" dark focus={{x:517,y:203,w:1178,h:224,label:'DOCUMENT UPLOAD'}}/></Sequence>
  <Sequence from={22*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/teacher-tracker.jpg" number="03" kicker="TRACK" title="See each submission" note="Status and deadlines · actual application" dark focus={{x:280,y:655,w:1370,h:167,label:'SUBMISSION RECORD'}}/></Sequence>
  <Sequence from={27*fps} durationInFrames={4*fps} premountFor={fps}><ScreenScene durationSec={4} src="live/calendar-week5-7.jpg" number="04" kicker="PLAN" title="Deadlines in view" note="Term 2 · actual application" cropY={-200} focus={{x:580,y:328,w:1030,h:600,label:'WEEKS 5–7'}}/></Sequence>
  <Sequence from={31*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/school-overview-light.jpg" number="05" kicker="REVIEW" title="One school, in context" note="Salong Elementary School · actual values" focus={{x:260,y:445,w:1400,h:138,label:'SCHOOL MONITORING'}}/></Sequence>
  <Sequence from={36*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/district-overview-light.jpg" number="06" kicker="MONITOR" title="The district view" note="Five schools · actual values" focus={{x:260,y:445,w:1400,h:138,label:'DISTRICT MONITORING'}}/></Sequence>
  <Sequence from={41*fps} durationInFrames={5*fps} premountFor={fps}><ScreenScene durationSec={5} src="live/district-archive-root.jpg" number="07" kicker="FIND" title="Return to the archive" note="Document folders · actual application" focus={{x:260,y:190,w:1370,h:400,label:'ARCHIVE'}}/></Sequence>
  <Sequence from={46*fps} durationInFrames={4*fps} premountFor={fps}><ScreenScene durationSec={4} src="live/district-archive-schools.jpg" number="08" kicker="INSPECT" title="Follow the record" note="School folders · actual application" focus={{x:260,y:190,w:1370,h:400,label:'SCHOOL CONTEXT'}}/></Sequence>
  <Sequence from={50*fps} durationInFrames={6*fps} premountFor={fps}><ScreenScene durationSec={6} src="live/district-trends-light.jpg" number="09" kicker="UNDERSTAND" title="Patterns in view" note="Real charts · values unchanged" cropY={-300} focus={{x:690,y:655,w:800,h:255,label:'UPLOADS & MISSING DLLS'}}/></Sequence>
  <Sequence from={56*fps} durationInFrames={4*fps} premountFor={fps}><BrandScene closing/></Sequence>
  {caption&&<div style={{position:'absolute',left:105,right:105,bottom:21,minHeight:54,display:'flex',alignItems:'center',justifyContent:'center',color:'white',background:'#123B63f2',fontSize:25,fontWeight:550,textAlign:'center',padding:'10px 20px',borderLeft:`6px solid ${P.gold}`}}>{caption}</div>}
 </AbsoluteFill>
};
