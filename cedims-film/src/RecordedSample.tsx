import React from 'react';
import {AbsoluteFill,Audio,Sequence,Video,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
const gold='#F2B705';
const ease=(x:number)=>1-Math.pow(1-Math.max(0,Math.min(1,x)),3);
const Caption=({text}:{text:string})=><div style={{position:'absolute',left:130,right:130,bottom:29,textAlign:'center',color:'white',fontFamily:'Segoe UI, Arial, sans-serif',fontSize:28,fontWeight:650}}><span style={{background:'#091b2ff2',padding:'10px 24px',borderLeft:`5px solid ${gold}`}}>{text}</span></div>;
export const RecordedSample:React.FC=()=>{const f=useCurrentFrame(),{fps}=useVideoConfig();const chapter=f<7*fps?'01 / CHANGE THE WEEK':'02 / OPEN THE TRENDS';const line1=f>=0.5*fps&&f<4.46*fps;const line2=f>=8*fps&&f<12.85*fps;return <AbsoluteFill style={{background:'#081629',overflow:'hidden',fontFamily:'Segoe UI, Arial, sans-serif'}}>
 <div style={{position:'absolute',left:120,top:26,color:gold,fontSize:22,fontWeight:850,letterSpacing:4,opacity:ease(f/10)}}>{chapter}</div>
 <div style={{position:'absolute',right:120,top:31,color:'#abc3d8',fontSize:17,fontWeight:700,letterSpacing:1}}>LIVE CEDIMS · DISTRICT VIEW</div>
 <div style={{position:'absolute',left:120,top:91,width:1680,height:861,overflow:'hidden',border:'1px solid #52708d',boxShadow:'0 20px 65px #0008'}}><Video src={staticFile('live-recordings/district-live-14s.mp4')} muted style={{width:1680,height:861}}/></div>
 <div style={{position:'absolute',left:120,top:91,width:1680*ease(f/(14*fps)),height:4,background:gold}}/>
 <Sequence from={Math.round(.5*fps)} durationInFrames={Math.ceil(4*fps)}><Audio src={staticFile('live-recordings/voice-1.wav')}/></Sequence>
 <Sequence from={8*fps} durationInFrames={Math.ceil(4.9*fps)}><Audio src={staticFile('live-recordings/voice-2.wav')}/></Sequence>
 <Audio src={staticFile('score.wav')} volume={0.15}/>
 {line1&&<Caption text="Change the reporting week. The district totals update with it."/>}
 {line2&&<Caption text="Open trends to inspect uploads and missing lesson logs across schools."/>}
 </AbsoluteFill>};
