import {traceJigsaw} from './hero-jigsaw-geometry.mjs';

// The guide, cut pieces, tray and drag all use this same photograph transform.
export function jigsawImageCrop(width,height){
 const cropWidth=Math.min(width,height*1.5),cropHeight=cropWidth/1.5;
 return [(width-cropWidth)/2,(height-cropHeight)/2,cropWidth,cropHeight];
}
export function cutJigsawPicture(image){
 const source=jigsawImageCrop(image.naturalWidth,image.naturalHeight);
 return Array.from({length:16},(_,index)=>{
  const canvas=document.createElement('canvas');canvas.width=432;canvas.height=288;
  const ctx=canvas.getContext('2d');ctx.scale(3,2);ctx.translate(22,22);traceJigsaw(ctx,index);
  ctx.save();ctx.clip();ctx.drawImage(image,...source,-(index%4)*100,-Math.floor(index/4)*100,400,400);ctx.restore();
  ctx.strokeStyle='#26324955';ctx.lineWidth=.45;ctx.stroke();return canvas.toDataURL('image/png');
 });
}
export function jigsawOutlines(hint=false){return Array.from({length:16},(_,index)=>{
 const canvas=document.createElement('canvas');canvas.width=432;canvas.height=288;
 const ctx=canvas.getContext('2d');ctx.scale(3,2);ctx.translate(22,22);traceJigsaw(ctx,index);
 if(hint){ctx.lineWidth=5;ctx.strokeStyle='#fff';ctx.stroke();ctx.lineWidth=2.8;ctx.strokeStyle='#0240de'}
 else{ctx.lineWidth=.7;ctx.strokeStyle='#8c7a5e'}ctx.stroke();return canvas.toDataURL('image/png');
})}
export function jigsawTargetAt(rect,x,y){
 if(x<rect.left||x>=rect.right||y<rect.top||y>=rect.bottom)return null;
 return Math.floor((y-rect.top)/rect.height*4)*4+Math.floor((x-rect.left)/rect.width*4);
}
