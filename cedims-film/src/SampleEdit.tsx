import React from 'react';
import {AbsoluteFill,Audio,Img,Sequence,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';

const navy='#081629', ink='#f6f8fc', gold='#f2b705';
const ease=(v:number)=>1-Math.pow(1-Math.max(0,Math.min(1,v)),3);
const shell:React.CSSProperties={background:navy,color:ink,fontFamily:'Segoe UI, Arial, sans-serif',overflow:'hidden'};
function Pointer({x,y,click=0}:{x:number;y:number;click?:number}){return <div style={{position:'absolute',left:x,top:y,zIndex:10,filter:'drop-shadow(0 2px 4px #000b)'}}><svg width="34" height="42" viewBox="0 0 34 42"><path d="M3 2v32l9-9 6 14 6-3-6-13h13Z" fill="white" stroke="#0a1b2e" strokeWidth="2"/></svg><div style={{position:'absolute',left:-21,top:-21,width:64,height:64,border:`3px solid ${gold}`,borderRadius:'50%',transform:`scale(${1+click*.6})`,opacity:click}}/></div>}
function Caption({text,until}:{text:string;until:number}){const f=useCurrentFrame();if(f<30||f>until)return null;return <div style={{position:'absolute',left:130,right:130,bottom:48,display:'flex',justifyContent:'center',opacity:ease((f-30)/6)}}><span style={{background:'#081629f2',color:'#fff',borderLeft:`6px solid ${gold}`,padding:'13px 25px',fontSize:30,fontWeight:600,textAlign:'center'}}>{text}</span></div>}
function Step({n,label}:{n:string;label:string}){return <div style={{position:'absolute',left:105,top:58,color:gold,fontSize:22,fontWeight:800,letterSpacing:5}}>{n} / {label}</div>}
function Loads(){const f=useCurrentFrame();const z=1+0.10*ease((f-18)/95);const x=340+(390-340)*ease((f-72)/55);const y=390+(37-390)*ease((f-72)/55);return <AbsoluteFill style={shell}>
 <Step n="01" label="ASSIGNED LOAD"/>
 <div style={{position:'absolute',left:105,top:125,fontSize:65,fontWeight:800,lineHeight:1.02}}>Begin with the<br/><span style={{color:gold}}>real teaching load.</span></div>
 <div style={{position:'absolute',left:105,top:305,width:370,fontSize:25,lineHeight:1.35,color:'#afc2d5'}}>Grade and subject are already visible in the teacher workspace.</div>
 <div style={{position:'absolute',left:530,top:70,width:1320,height:820,overflow:'hidden',border:'1px solid #3e5c77',boxShadow:'0 30px 80px #0008'}}>
  <Img src={staticFile('live/teacher-loads.jpg')} style={{position:'absolute',left:-90,top:0,width:1398,height:820,transform:`scale(${z})`,transformOrigin:'450px 300px'}}/>
  <div style={{position:'absolute',left:125,top:174,width:340,height:210,border:`3px solid ${gold}`,opacity:ease((f-20)/15)}}/>
  <Pointer x={x} y={y} click={ease((f-131)/4)*(1-ease((f-142)/8))}/>
 </div>
 <Caption text="Open the assigned teaching load." until={95}/>
 </AbsoluteFill>}
function Upload(){const f=useCurrentFrame();const x=520+(450-520)*ease((f-90)/43);const y=325+(37-325)*ease((f-90)/43);return <AbsoluteFill style={{...shell,background:'#f3f6fa',color:'#102c49'}}>
 <Step n="02" label="DOCUMENT UPLOAD"/>
 <div style={{position:'absolute',left:105,top:112,fontSize:58,fontWeight:800}}>A focused place to submit.</div>
 <div style={{position:'absolute',left:105,top:190,width:1710,height:575,overflow:'hidden',border:'1px solid #cad5df',boxShadow:'0 24px 65px #123B6338'}}>
  <Img src={staticFile('live/teacher-upload.jpg')} style={{position:'absolute',left:0,top:0,width:1710,height:1004}}/>
  <div style={{position:'absolute',left:510,top:205,width:1160,height:225,border:`3px solid ${gold}`,opacity:ease((f-16)/14)}}/>
  <Pointer x={x} y={y} click={ease((f-137)/4)*(1-ease((f-148)/7))}/>
 </div>
 <div style={{position:'absolute',left:105,top:800,display:'flex',gap:22}}>{['CHOOSE PDF','UPLOAD','CHECK STATUS'].map((t,i)=><div key={t} style={{background:i===1?gold:'#e5ecf2',padding:'17px 25px',fontWeight:800,fontSize:22,letterSpacing:1,opacity:ease((f-27-i*13)/10),transform:`translateY(${(1-ease((f-27-i*13)/10))*30}px)`}}>{t}</div>)}</div>
 <Caption text="Move to Upload to add a lesson plan PDF." until={123}/>
 </AbsoluteFill>}
function Tracker(){const f=useCurrentFrame();const zoom=1+0.09*ease((f-28)/90);return <AbsoluteFill style={shell}>
 <Step n="03" label="SUBMISSION STATUS"/>
 <div style={{position:'absolute',left:105,top:125,fontSize:64,fontWeight:800,lineHeight:1.03}}>See what<br/><span style={{color:gold}}>was submitted.</span></div>
 <div style={{position:'absolute',left:105,top:333,fontSize:28,color:'#b5c8da'}}>18 expected · 18 submitted</div>
 <div style={{position:'absolute',left:780,top:190,width:900,height:590,overflow:'hidden',border:'1px solid #406080',boxShadow:'0 30px 80px #0008'}}>
  <Img src={staticFile('live/teacher-tracker.jpg')} style={{position:'absolute',left:-550,top:-300,width:1388,height:815,transform:`scale(${zoom})`,transformOrigin:'760px 600px'}}/>
  <div style={{position:'absolute',left:417,top:288,width:405,height:95,border:`3px solid ${gold}`,opacity:ease((f-35)/20)}}/>
  <div style={{position:'absolute',left:417,top:240,background:gold,color:navy,padding:'9px 18px',fontSize:19,fontWeight:800,opacity:ease((f-41)/15)}}>SUBMITTED · LATE</div>
 </div>
 <Caption text="Then open Tracker to check the submission status." until={127}/>
 </AbsoluteFill>}
export const SampleEdit:React.FC=()=>{const {fps}=useVideoConfig();return <AbsoluteFill style={shell}>
 <Sequence durationInFrames={5*fps} premountFor={fps}><Loads/><Sequence from={fps} durationInFrames={4*fps}><Audio src={staticFile('sample-voice-1.wav')}/></Sequence></Sequence>
 <Sequence from={5*fps} durationInFrames={5*fps} premountFor={fps}><Upload/><Sequence from={fps} durationInFrames={4*fps}><Audio src={staticFile('sample-voice-2.wav')}/></Sequence></Sequence>
 <Sequence from={10*fps} durationInFrames={5*fps} premountFor={fps}><Tracker/><Sequence from={fps} durationInFrames={4*fps}><Audio src={staticFile('sample-voice-3.wav')}/></Sequence></Sequence>
 <Audio src={staticFile('score.wav')} volume={0.18}/>
 </AbsoluteFill>};
