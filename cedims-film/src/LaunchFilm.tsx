import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';

const C={navy:'#07182e',navy2:'#0c2c52',blue:'#2447b5',gold:'#f2b705',white:'#f8fbff',ink:'#142d49',muted:'#a8bfd4'};
const font='Segoe UI, Arial, sans-serif';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};
const ease=(x:number)=>1-Math.pow(1-Math.max(0,Math.min(1,x)),3);

function Grid(){return <AbsoluteFill style={{backgroundImage:'linear-gradient(#ffffff08 1px, transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)',backgroundSize:'90px 90px'}}/>}
function Sweep({at=0}:{at?:number}){const f=useCurrentFrame();const x=interpolate(f,[at,at+18],[-500,2400],clamp);return <div style={{position:'absolute',left:x,top:-300,width:150,height:1700,background:'linear-gradient(90deg,transparent,#70b5ff80,transparent)',filter:'blur(28px)',rotate:'22deg',pointerEvents:'none'}}/>}
function Wipe(){const f=useCurrentFrame();return <div style={{position:'absolute',inset:0,left:interpolate(f,[0,20],[0,1920],clamp),background:C.navy,zIndex:20,pointerEvents:'none',boxShadow:'-45px 0 85px #3a89d15e'}}/>}
function Bottom({step}:{step:string}){return <div style={{position:'absolute',left:90,right:90,bottom:55,display:'flex',alignItems:'center',gap:18,color:'#b4cadc',fontSize:18,letterSpacing:2,fontWeight:700}}><div style={{width:72,height:4,background:C.gold}}/>{step}<div style={{height:1,flex:1,background:'#ffffff35'}}/><span>SMART E-VISION / CEDIMS</span></div>}

function Intro(){const f=useCurrentFrame();const words=['LESSON LOGS','DEADLINES','REVIEWS','FOLLOW-UPS'];return <AbsoluteFill style={{background:C.navy,fontFamily:font,overflow:'hidden'}}><Grid/><div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 72% 38%,#1d4a81aa,transparent 43%)'}}/>{words.map((w,i)=>{const a=ease((f-i*10)/18);return <div key={w} style={{position:'absolute',left:160+(i%2)*785,top:185+Math.floor(i/2)*198,color:'#d2e4f3',fontWeight:800,fontSize:43,letterSpacing:1,opacity:a,translate:`0 ${(1-a)*38}px`,borderLeft:`5px solid ${i===3?C.gold:'#3e80d6'}`,paddingLeft:22}}>{w}</div>})}<div style={{position:'absolute',left:160,top:790,color:'white',fontWeight:800,fontSize:65,letterSpacing:-2,opacity:ease((f-55)/20)}}>A clearer view starts<br/><span style={{color:C.gold}}>with a shared record.</span></div><Sweep at={64}/><Bottom step="01 / THE NEED"/></AbsoluteFill>}

function Reveal(){const f=useCurrentFrame();const a=ease(f/20);return <AbsoluteFill style={{background:C.navy,fontFamily:font,overflow:'hidden'}}><Grid/><div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 50% 52%,#20599b88,transparent 51%)'}}/><div style={{position:'absolute',left:140,top:172,color:C.gold,fontSize:25,fontWeight:800,letterSpacing:6,opacity:a}}>INTRODUCING</div><div style={{position:'absolute',left:140,top:267,color:'white',fontSize:130,fontWeight:900,letterSpacing:-5,lineHeight:1,opacity:a,scale:0.87+0.13*a}}>SMART<br/><span style={{color:'#72b4ff'}}>E-VISION</span></div><div style={{position:'absolute',left:146,top:605,color:'#d6e9f8',fontSize:33,fontWeight:600,opacity:ease((f-18)/18)}}>Instructional supervision, in one connected workflow.</div><Img src={staticFile('brand/cedims-lockup-horizontal-reverse.svg')} style={{position:'absolute',right:105,bottom:140,width:420,height:125,objectFit:'contain',opacity:ease((f-27)/15)}}/><Sweep at={12}/><Bottom step="02 / THE SYSTEM"/></AbsoluteFill>}

type ShotProps={src:string;trim?:number;label:string;title:string;sub:string;step:string;word:string;index:string;duration:number;focusX?:number;focusY?:number;zoom?:number;dark?:boolean};
function Shot({src,trim=0,label,title,sub,step,word,index,duration,focusX=0,focusY=0,zoom=1.17,dark=false}:ShotProps){
 const f=useCurrentFrame(),{fps}=useVideoConfig();const total=duration*fps;const enter=ease(f/16),end=ease((total-f)/16);const move=ease((f-24)/(total-48));
 const camera=interpolate(f,[0,18,total*.28,total*.56,total*.78,total-14,total],[1,1.025,zoom,zoom*.97,1.075,1,1],clamp);
 const wordIn=ease((f-17)/13),wordOut=1-ease((f-78)/15),wordOpacity=Math.min(wordIn,wordOut);
 return <AbsoluteFill style={{background:dark?C.navy:C.white,fontFamily:font,overflow:'hidden'}}>
  {dark&&<Grid/>}<div style={{position:'absolute',inset:0,background:dark?'radial-gradient(circle at 70% 50%,#123e6a,transparent 65%)':'linear-gradient(135deg,#f8fbff,#eaf2fb)'}}/>
  <div style={{position:'absolute',left:92,top:58,color:dark?C.gold:C.blue,fontSize:21,fontWeight:850,letterSpacing:4}}>{index} / {label}</div>
  <div style={{position:'absolute',left:92,top:101,color:dark?'white':C.ink,fontSize:68,fontWeight:850,letterSpacing:-2.3,opacity:enter,translate:`0 ${(1-enter)*26}px`}}>{title}</div>
  <div style={{position:'absolute',right:92,top:118,color:dark?'#b9cee0':'#5e7488',fontSize:22,fontWeight:550,textAlign:'right',maxWidth:530}}>{sub}</div>
  <div style={{position:'absolute',left:92,right:92,top:192,height:2,background:dark?'#ffffff30':'#c8d7e7'}}/>
  <div style={{position:'absolute',left:92,top:192,width:1736*f/(duration*fps),height:3,background:C.gold}}/>
  <div style={{position:'absolute',left:92,right:92,top:226,bottom:130,overflow:'hidden',borderRadius:18,background:'#fff',border:dark?'1px solid #4b7298':'1px solid #c4d3e3',boxShadow:'0 24px 75px #05172a35',opacity:Math.min(enter,end),scale:0.96+0.04*enter}}>
   {src.endsWith('.jpg')
    ? <Img src={staticFile(`launch/${src}`)} style={{position:'absolute',left:'50%',top:'50%',width:'100%',height:'100%',objectFit:'cover',translate:`calc(-50% + ${focusX*move}px) calc(-50% + ${focusY*move}px)`,scale:camera}}/>
    : <Video src={staticFile(`launch/${src}`)} trimBefore={trim*fps} muted premountFor={fps} objectFit="cover" style={{position:'absolute',left:'50%',top:'50%',width:'100%',height:'100%',translate:`calc(-50% + ${focusX*move}px) calc(-50% + ${focusY*move}px)`,scale:camera}}/>}
   <div style={{position:'absolute',left:0,right:0,top:0,bottom:0,background:'#06192bd6',opacity:wordOpacity,pointerEvents:'none'}}/>
   <div style={{position:'absolute',left:66,top:236,color:'#fff',fontSize:110,fontWeight:900,letterSpacing:-4,opacity:wordOpacity,translate:`${(1-wordIn)*-80}px 0`,textShadow:'0 10px 35px #0008'}}>{word}<span style={{color:C.gold}}>.</span></div>
   <div style={{position:'absolute',left:0,bottom:0,right:0,height:110,background:'linear-gradient(transparent,#06192bd0)'}}/>
   <div style={{position:'absolute',left:28,bottom:24,background:C.gold,color:C.navy,padding:'12px 18px',borderRadius:5,fontSize:23,fontWeight:850,letterSpacing:1,opacity:ease((f-12)/14)}}>{step}</div>
  </div><Bottom step={label}/><Wipe/>
 </AbsoluteFill>
}

function Mobile(){const f=useCurrentFrame(),{fps}=useVideoConfig(),a=ease(f/18),m=ease((f-36)/220);return <AbsoluteFill style={{background:C.navy,fontFamily:font,overflow:'hidden'}}><Grid/><div style={{position:'absolute',left:120,top:130,color:C.gold,fontSize:24,fontWeight:800,letterSpacing:5}}>ACCESS AND VERIFY</div><div style={{position:'absolute',left:120,top:228,color:'white',fontSize:72,fontWeight:850,lineHeight:1.05,letterSpacing:-2,opacity:a}}>A record you can<br/><span style={{color:'#78b9ff'}}>check anywhere.</span></div><div style={{position:'absolute',left:122,top:485,width:560,color:'#c7d9e8',fontSize:30,lineHeight:1.45,opacity:ease((f-15)/15)}}>The mobile view follows the record from district monitoring to its verified document.</div><div style={{position:'absolute',right:230,top:67,width:410,height:915,borderRadius:52,border:'10px solid #223c5b',boxShadow:'0 35px 95px #0009,0 0 80px #317ad14d',overflow:'hidden',background:'#fff',opacity:a,translate:`0 ${(1-a)*70}px`,scale:1+0.04*m}}><Video src={staticFile('launch/mobile.mp4')} trimBefore={42*fps} muted premountFor={fps} objectFit="cover" style={{width:'100%',height:'100%'}}/><div style={{position:'absolute',top:12,left:'36%',width:'28%',height:21,borderRadius:20,background:'#090f1d'}}/></div><Sweep at={20}/><Bottom step="09 / MOBILE VERIFICATION"/></AbsoluteFill>}

function End(){const f=useCurrentFrame(),a=ease(f/18);return <AbsoluteFill style={{background:C.navy,fontFamily:font,overflow:'hidden'}}><Grid/><div style={{position:'absolute',inset:0,background:'radial-gradient(circle at center,#1a4a83aa,transparent 58%)'}}/><div style={{position:'absolute',left:0,right:0,top:190,textAlign:'center',color:'#a9c8e5',fontSize:28,fontWeight:700,letterSpacing:8,opacity:a}}>SUBMIT  ·  REVIEW  ·  MONITOR  ·  ACT</div><div style={{position:'absolute',left:0,right:0,top:344,textAlign:'center',color:'white',fontSize:107,fontWeight:900,letterSpacing:-4,opacity:ease((f-13)/18)}}>SMART <span style={{color:'#79b9ff'}}>E-VISION</span></div><div style={{position:'absolute',left:0,right:0,top:510,textAlign:'center',color:'white',fontSize:39,opacity:ease((f-24)/18)}}>Clear records. Shared responsibility.</div><Img src={staticFile('brand/cedims-lockup-horizontal-reverse.svg')} style={{position:'absolute',left:750,top:655,width:420,height:120,objectFit:'contain',opacity:ease((f-30)/14)}}/><div style={{position:'absolute',left:840,top:825,width:240*ease((f-35)/15),height:7,background:C.gold}}/></AbsoluteFill>}

const captions=[
 'Every week, instructional records move between teachers and supervisors. When lesson logs, deadlines, and follow-ups are scattered, the full picture is hard to see.',
 'Meet Smart E-VISION, the progressive web app for instructional supervision archiving in Calapan East District.',
 'The work begins with a teaching load. Assigned subjects and weekly requirements give each teacher a clear place to start.',
 'A teacher chooses a lesson document. Smart E-VISION reads the file and suggests details. The teacher checks the information, then submits the record.',
 'The document enters the archive with its status, date, and verification information connected to the submission.',
 'A reviewer opens the actual file, examines the lesson plan, and records remarks. The teacher can see when it has been checked.',
 'School leaders can see missing work, documents waiting for remarks, and submissions that arrived on time or after the deadline.',
 'District supervisors can look across schools, follow records needing attention, and explore patterns that help guide technical assistance.',
 'On a phone, the same archive remains accessible. A QR code opens the verification record and confirms the official file.',
 'From classroom record to district insight. Smart E-VISION. Clear records. Shared responsibility.'
];
const starts=[0,12,20,34,58,70,88,104,120,132];
export const LaunchFilm:React.FC=()=>{const f=useCurrentFrame(),{fps}=useVideoConfig();const sec=f/fps;const idx=starts.findIndex((s,i)=>sec>=s&&(i===starts.length-1||sec<starts[i+1]));const caption=idx>=0?captions[idx]:'';return <AbsoluteFill style={{background:C.navy,fontFamily:font}}>
 <Audio src={staticFile('launch/score.wav')} volume={0.42}/><Audio src={staticFile('launch/voice.wav')} volume={1}/>
 <Sequence durationInFrames={12*fps} premountFor={fps}><Intro/></Sequence>
 <Sequence from={12*fps} durationInFrames={8*fps} premountFor={fps}><Reveal/></Sequence>
 <Sequence from={20*fps} durationInFrames={14*fps} premountFor={fps}><Shot src="loads.mp4" label="PREPARE" title="Start with the teaching load" sub="Teacher workflow · actual system" step="ASSIGNED SUBJECTS" word="PREPARE" index="03" duration={14} zoom={1.13} dark/></Sequence>
 <Sequence from={34*fps} durationInFrames={24*fps} premountFor={fps}><Shot src="upload.mp4" label="SUBMIT" title="From file to submission" sub="Document review · actual system" step="CHOOSE → CHECK → SUBMIT" word="UPLOAD" index="04" duration={24} zoom={1.19}/></Sequence>
 <Sequence from={58*fps} durationInFrames={12*fps} premountFor={fps}><Shot src="district-archive-root-safe.jpg" label="ARCHIVE" title="Every record has a place" sub="Searchable document trail" step="DOCUMENT ARCHIVE" word="ARCHIVE" index="05" duration={12} zoom={1.15} dark/></Sequence>
 <Sequence from={70*fps} durationInFrames={18*fps} premountFor={fps}><Shot src="review.mp4" trim={15} label="REVIEW" title="Feedback stays with the file" sub="Reviewer remarks · actual system" step="OPEN → EXAMINE → REMARK" word="REVIEW" index="06" duration={18} zoom={1.18}/></Sequence>
 <Sequence from={88*fps} durationInFrames={16*fps} premountFor={fps}><Shot src="school-overview-light-safe.jpg" label="SCHOOL VIEW" title="See what needs attention" sub="Missing · for checking · on time" step="FOLLOW UP WITH CONTEXT" word="MONITOR" index="07" duration={16} zoom={1.16} dark/></Sequence>
 <Sequence from={104*fps} durationInFrames={16*fps} premountFor={fps}><Shot src="district-trends-light-safe.jpg" label="DISTRICT VIEW" title="Turn records into insight" sub="School patterns · actual system" step="MONITOR → EXPLORE → ACT" word="ACT" index="08" duration={16} zoom={1.16}/></Sequence>
 <Sequence from={120*fps} durationInFrames={12*fps} premountFor={fps}><Mobile/></Sequence>
 <Sequence from={132*fps} durationInFrames={8*fps} premountFor={fps}><End/></Sequence>
 {caption&&<div style={{position:'absolute',left:220,right:220,bottom:9,minHeight:42,display:'flex',alignItems:'center',justifyContent:'center',padding:'8px 18px',background:'#06192bea',color:'white',fontSize:21,fontWeight:600,textAlign:'center',borderTop:`3px solid ${C.gold}`}}>{caption}</div>}
 </AbsoluteFill>};
