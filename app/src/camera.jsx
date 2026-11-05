import React,{useEffect,useState} from 'react';
import {Camera} from '@phosphor-icons/react';

// Phones and tablets get a "Take photo" button that opens the camera directly (capture attribute).
// Desktop keeps the normal file chooser only.
export function useTouchCamera(){const query='(pointer: coarse)',[touch,setTouch]=useState(()=>typeof matchMedia==='function'&&matchMedia(query).matches);useEffect(()=>{if(typeof matchMedia!=='function')return;const list=matchMedia(query),update=()=>setTouch(list.matches);list.addEventListener?.('change',update);return()=>list.removeEventListener?.('change',update)},[]);return touch}

export function CameraButton({label,onFile,facing='environment',disabled=false,className='button secondary'}){const touch=useTouchCamera();if(!touch)return null;return <label className={className+' camera-button'+(disabled?' disabled':'')}><Camera size={21}/><span>{label}</span><input type="file" hidden disabled={disabled} accept="image/*" capture={facing} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(file)await onFile(file)}}/></label>}

const imageType=file=>/^image\//.test(file?.type||'')||/\.(heic|heif|jpe?g|png|webp)$/i.test(file?.name||'');
const stamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+'.'+p(d.getMinutes())};

// Camera pictures are 3–6 MB. Documents keep enough detail to read text (2200px, JPEG) at a fraction of the size.
// Non-images (PDF, DOCX, TXT) pass through unchanged.
export async function prepareDocumentImage(file,{fromCamera=false,maxSide=2200,quality=.82}={}){
 if(!file||!imageType(file))return file;
 let bitmap;try{bitmap=await createImageBitmap(file)}catch{bitmap=await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('This photo could not be read.'))};img.src=url})}
 const width=bitmap.width||bitmap.naturalWidth,height=bitmap.height||bitmap.naturalHeight,scale=Math.min(1,maxSide/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
 const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob)return file;
 if(!fromCamera&&blob.size>=file.size&&/\.(jpe?g|png|webp)$/i.test(file.name))return file;
 const base=fromCamera||/^image\.(jpe?g|heic)$/i.test(file.name)?'Photo '+stamp():file.name.replace(/\.[^.]+$/,'');
 return new File([blob],base+'.jpg',{type:'image/jpeg',lastModified:Date.now()})
}
