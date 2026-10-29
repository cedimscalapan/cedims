import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Video} from '@remotion/media';

const N='#07162b', B='#2453d4', G='#f2b705', W='#ffffff';
const font='Segoe UI, Arial, sans-serif';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};
const lerp=(f:number,a:number,b:number,x:number,y:number)=>interpolate(f,[a,b],[x,y],clamp);
const ease=(n:number)=>1-Math.pow(1-Math.min(1,Math.max(0,n)),3);

function BrandMark({light=false}:{light?:boolean}){return <Img src={staticFile(light?'brand/cedims-lockup-horizontal.svg':'brand/cedims-lockup-horizontal-reverse.svg')} style={{width:300,height:94,objectFit:'contain'}}/>}
function Glow({gold=false}:{gold?:boolean}){const f=useCurrentFrame();return <div style={{position:'absolute',inset:-400,background:`radial-gradient(circle at ${45+8*Math.sin(f/80)}% ${45+7*Math.cos(f/95)}%,${gold?'#f2b70545':'#1757bd63'},transparent 39%)`,pointerEvents:'none'}}/>}
function Flash(){const f=useCurrentFrame();return <div style={{position:'absolute',inset:0,background:W,opacity:lerp(f,0,11,.9,0),pointerEvents:'none',zIndex:10}}/>}
function MiniSquares(){const f=useCurrentFrame();return <>{[0,1,2,3].map(i=><div key={i} style={{position:'absolute',left:150+i*420,top:260+(i%2)*480,width:13,height:13,background:i===2?G:W,opacity:.5+Math.sin(f/13+i)*.35,rotate:`${f/5+i*15}deg`}}/>)}</>}

function Intro(){const f=useCurrentFrame();const beats=[['Every record.',0,115],['Every deadline.',115,230],['One shared view.',230,360]];return <AbsoluteFill style={{background:N,fontFamily:font,overflow:'hidden'}}><Glow/><MiniSquares/>{beats.map(([s,a,b],i)=>{const start=Number(a),end=Number(b),p=ease((f-start)/15),q=1-ease((f-end+18)/18);return <div key={String(s)} style={{position:'absolute',left:130,top:345,color:i===2?G:W,fontSize:118,fontWeight:850,letterSpacing:-5,opacity:Math.min(p,q),translate:`${(1-p)*110}px ${(1-p)*25}px`,filter:`blur(${(1-p)*12}px)`}}>{s}</div>})}<div style={{position:'absolute',left:136,top:72,color:'#a8b9ca',fontSize:23,fontWeight:700,letterSpacing:6}}>INSTRUCTIONAL SUPERVISION / CALAPAN EAST</div><div style={{position:'absolute',left:136,bottom:84,width:350,height:6,background:G}}/><Flash/></AbsoluteFill>}

function Brand(){const f=useCurrentFrame(),a=ease(f/22);return <AbsoluteFill style={{background:W,fontFamily:font,overflow:'hidden'}}><div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 80% 30%,#d5e7ff,transparent 42%)'}}/><div style={{position:'absolute',left:130,top:214,color:N,fontSize:112,fontWeight:900,letterSpacing:-5,opacity:a,translate:`${(1-a)*-130}px 0`}}>SMART <span style={{color:B}}>E-VISION</span></div><div style={{position:'absolute',left:135,top:386,fontSize:43,color:'#415973',opacity:ease((f-16)/17)}}>A Progressive Web App for Instructional Supervision Archiving</div><div style={{position:'absolute',right:130,bottom:130,opacity:ease((f-48)/18)}}><BrandMark light/></div><div style={{position:'absolute',left:132,top:566,width:lerp(f,19,70,0,1100),height:8,background:G}}/><Flash/></AbsoluteFill>}

type SegmentProps={duration:number;src:string;trim?:number;phrase:string;detail:string;tag:string;dark?:boolean;zoom?:number;accent?:string;prompt?:boolean};
function Segment({duration,src,trim=0,phrase,detail,tag,dark=true,zoom=1.17,accent=B,prompt=false}:SegmentProps){
 const f=useCurrentFrame(),{fps}=useVideoConfig();const total=duration*fps,hero=Math.min(95,total*.28),p=ease(f/18),out=1-ease((f-hero+20)/18),show=ease((f-hero+15)/21),later=ease((f-total*.53)/17)*(1-ease((f-total*.53-75)/20));
 const camera=interpolate(f,[0,hero,hero+24,total*.58,total*.8,total],[.78,.82,1.02,zoom,zoom*.94,1.0],clamp);
 const isImg=src.endsWith('.jpg');
 return <AbsoluteFill style={{background:dark?N:W,fontFamily:font,overflow:'hidden'}}>
  {dark?<Glow/>:<div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 8% 84%,#d9e9ff,transparent 34%)'}}/>}
  <div style={{position:'absolute',left:115,top:100,color:dark?'#9fb5d3':'#607386',fontSize:23,fontWeight:700,letterSpacing:5,opacity:p}}>{tag.toUpperCase()}</div>
  {prompt?<div style={{position:'absolute',left:245,right:245,top:425,height:114,borderRadius:16,background:W,boxShadow:'0 20px 75px #0002',display:'flex',alignItems:'center',padding:'0 38px',fontSize:39,color:N,opacity:out,scale:.92+.08*p}}>Upload a lesson plan<span style={{color:accent,marginLeft:7}}>|</span><span style={{marginLeft:'auto',background:N,color:W,fontSize:32,padding:'8px 18px',borderRadius:9}}>↗</span></div>:<div style={{position:'absolute',left:115,right:100,top:355,color:dark?W:N,fontSize:124,fontWeight:850,letterSpacing:-5,lineHeight:1.04,opacity:out,translate:`${(1-p)*95}px 0`,filter:`blur(${(1-p)*9}px)`}}>{phrase}<span style={{color:accent}}>.</span></div>}
  <div style={{position:'absolute',left:70,right:70,top:95,bottom:85,overflow:'hidden',borderRadius:dark?24:6,background:W,border:dark?`2px solid ${accent}99`:'1px solid #d4e1ed',boxShadow:dark?`0 0 90px ${accent}50,0 30px 70px #0009`:'0 32px 70px #0d35663b',opacity:show,scale:camera,translate:`0 ${(1-show)*360}px`}}>
    {isImg?<Img src={staticFile(`launch/${src}`)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Video src={staticFile(`launch/${src}`)} trimBefore={trim*fps} muted objectFit="cover" premountFor={fps} style={{width:'100%',height:'100%'}}/>}
    <div style={{position:'absolute',inset:0,background:dark?'linear-gradient(90deg,#04162a95,transparent 55%)':'linear-gradient(90deg,#ffffff70,transparent 48%)',opacity:later}}/>
    <div style={{position:'absolute',left:235,top:390,maxWidth:1280,color:dark?W:N,background:dark?'#06192be8':'#ffffffed',borderLeft:`8px solid ${accent}`,padding:'16px 26px',fontSize:72,fontWeight:850,letterSpacing:-2,opacity:later,translate:`${(1-later)*-55}px 0`,boxShadow:'0 16px 45px #0003'}}>{detail}</div>
  </div>
  <div style={{position:'absolute',left:115,bottom:36,width:lerp(f,0,total,0,1690),height:5,background:accent}}/>
  <Flash/>
 </AbsoluteFill>
}

function Mobile(){const f=useCurrentFrame(),{fps}=useVideoConfig(),a=ease(f/20),phone=ease((f-40)/25);return <AbsoluteFill style={{background:N,fontFamily:font,overflow:'hidden'}}><Glow/><div style={{position:'absolute',left:110,top:165,color:W,fontSize:105,fontWeight:900,lineHeight:1.05,letterSpacing:-5,opacity:a}}>VERIFY<br/><span style={{color:G}}>ANYWHERE.</span></div><div style={{position:'absolute',left:115,top:465,color:'#b9d0e6',fontSize:34,opacity:ease((f-20)/18)}}>A mobile path from archive to official record.</div><div style={{position:'absolute',right:270,top:66,width:414,height:915,borderRadius:50,border:'11px solid #224774',overflow:'hidden',background:W,boxShadow:'0 0 90px #3376dc70',opacity:phone,scale:.7+.3*phone,translate:`0 ${(1-phone)*240}px`}}><Video src={staticFile('launch/mobile.mp4')} trimBefore={42*fps} muted objectFit="cover" premountFor={fps} style={{width:'100%',height:'100%'}}/></div><Flash/></AbsoluteFill>}

function End(){const f=useCurrentFrame(),a=ease(f/20);return <AbsoluteFill style={{background:N,fontFamily:font,overflow:'hidden'}}><Glow/><div style={{position:'absolute',left:100,right:100,top:320,textAlign:'center',fontSize:116,fontWeight:900,letterSpacing:-5,color:W,opacity:a,scale:.82+.18*a}}>SMART <span style={{color:'#6eafff'}}>E-VISION</span></div><div style={{position:'absolute',left:0,right:0,top:515,textAlign:'center',fontSize:43,color:'#d4e5f5',opacity:ease((f-20)/20)}}>Clear records. Shared responsibility.</div><div style={{position:'absolute',left:760,top:660,opacity:ease((f-36)/18)}}><BrandMark/></div><div style={{position:'absolute',left:810,top:820,width:lerp(f,25,80,0,300),height:7,background:G}}/><Flash/></AbsoluteFill>}

export const ReferenceLaunch:React.FC=()=>{const {fps}=useVideoConfig();return <AbsoluteFill style={{background:N}}>
 <Audio src={staticFile('launch/voice.wav')}/><Audio src={staticFile('launch/score.wav')} volume={.45}/><Audio src={staticFile('launch/transition-sfx.wav')} volume={.5}/>
 <Sequence durationInFrames={12*fps} premountFor={fps}><Intro/></Sequence>
 <Sequence from={12*fps} durationInFrames={8*fps} premountFor={fps}><Brand/></Sequence>
 <Sequence from={20*fps} durationInFrames={14*fps} premountFor={fps}><Segment duration={14} src="loads.mp4" phrase="Start with a teaching load" detail="Assigned subjects. Clear expectations." tag="01 / Prepare" dark accent="#2874ff" zoom={1.19}/></Sequence>
 <Sequence from={34*fps} durationInFrames={24*fps} premountFor={fps}><Segment duration={24} src="upload.mp4" phrase="Choose a document" detail="Detect. Confirm. Submit." tag="02 / Upload" dark={false} accent={B} zoom={1.23} prompt/></Sequence>
 <Sequence from={58*fps} durationInFrames={12*fps} premountFor={fps}><Segment duration={12} src="district-archive-root-safe.jpg" phrase="One archive" detail="Find every record." tag="03 / Archive" dark accent="#2874ff" zoom={1.2}/></Sequence>
 <Sequence from={70*fps} durationInFrames={18*fps} premountFor={fps}><Segment duration={18} src="review.mp4" trim={15} phrase="Review with context" detail="Remarks stay with the file." tag="04 / Review" dark={false} accent={B} zoom={1.2}/></Sequence>
 <Sequence from={88*fps} durationInFrames={16*fps} premountFor={fps}><Segment duration={16} src="school-overview-light-safe.jpg" phrase="One school" detail="See what needs attention." tag="05 / School view" dark accent="#2874ff" zoom={1.19}/></Sequence>
 <Sequence from={104*fps} durationInFrames={16*fps} premountFor={fps}><Segment duration={16} src="district-trends-light-safe.jpg" phrase="The bigger picture" detail="Turn records into insight." tag="06 / District view" dark={false} accent={B} zoom={1.19}/></Sequence>
 <Sequence from={120*fps} durationInFrames={12*fps} premountFor={fps}><Mobile/></Sequence>
 <Sequence from={132*fps} durationInFrames={8*fps} premountFor={fps}><End/></Sequence>
 </AbsoluteFill>};
