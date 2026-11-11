// The "Voice · m:ss" badge above a spoken question in בית AI. Typed questions carry voice 0 (or none from
// history); render nothing then, never a bare number (a stray "0" showed above typed messages before 1.64.1).
import React from 'react';
import {Microphone} from '@phosphor-icons/react';
export function VoiceBadge({a,seconds}){
 const s=Math.floor(Number(seconds));if(!(s>0))return null;
 return <span className="hai-voice"><Microphone size={14} weight="fill"/>{a.T('Voice','הקלטה')} · {Math.floor(s/60)}:{String(s%60).padStart(2,'0')}</span>}
