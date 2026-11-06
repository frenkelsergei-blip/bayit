import React from 'react';
function safeUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}}
function Inline({text}){return String(text).split(/(\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part,i)=>{
 const link=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/),href=safeUrl(link?.[2]||part);
 if(href)return <a key={i} href={href} target="_blank" rel="noopener noreferrer">{link?.[1]||part}</a>;
 if(part.startsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
 if(part.startsWith('*'))return <em key={i}>{part.slice(1,-1)}</em>;
 return part||null;
 })}
export function NoteContent({text='',onChange,disabled=false}){
 const lines=String(text).split('\n');
 return <div className="private-note-body">{lines.map((line,i)=>{const check=line.match(/^[-*] \[([ xX])\] (.*)$/);if(check)return <label className="note-check" key={i}><input type="checkbox" checked={check[1].toLowerCase()==='x'} disabled={disabled||!onChange} onChange={e=>onChange(lines.map((s,index)=>index===i?'- ['+(e.target.checked?'x':' ')+'] '+check[2]:s).join('\n'))}/><span><Inline text={check[2]}/></span></label>;
 const bullet=/^[-*] /.test(line),number=/^\d+\. /.test(line),content=line.replace(/^([-*]|\d+\.) /,'');return <p key={i} className={bullet||number?'note-bullet':''}>{bullet?'• ':number?line.match(/^\d+\./)[0]+' ':''}<Inline text={content||'\u00a0'}/></p>})}</div>;
}
