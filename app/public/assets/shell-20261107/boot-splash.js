import {createMaterials,renderSketchFrame} from './sketch-renderer.js';

const surface=document.getElementById('splash'),canvas=surface?.querySelector('canvas');
if(canvas){
 const context=canvas.getContext('2d'),media=matchMedia('(prefers-reduced-motion:reduce)');
 let frameId=0,width=0,height=0,lastFrame=-1,clock=performance.now(),materials=null,images=null;
 let active=window.__bayitSplash?.visible!==false,scene=pick();
 function pick(previous){
  const ids=['horizon','corners','orbit'].filter(id=>id!==previous),seed=crypto.getRandomValues(new Uint32Array(1))[0];
  return {id:ids[seed%ids.length],seed,mirror:!!(seed&4),scale:1};
 }
 function reduced(){return media.matches||document.documentElement.dataset.motion==='reduced'}
 function sync(){
  const night=document.documentElement.dataset.theme==='dark',he=document.documentElement.lang==='he';
  surface.querySelector('.boot-prefix').textContent=he?'קצת יותר':'A little more';
  surface.querySelector('.boot-word').textContent=he?'ביחד.':'together.';
  surface.querySelector('.boot-status').textContent=he?'פותחים את Bayit…':'Opening Bayit…';
  materials=images?{...createMaterials(context,images,night),night}:{blue:'#0641dd',yellow:'#ffd451',ink:night?'#c9d4ec':'#172b50',night};
  lastFrame=-1;
 }
 function size(){
  const box=surface.getBoundingClientRect();if(!box.width||!box.height)return;
  const dpr=Math.min(devicePixelRatio||1,2);
  if(width===box.width&&height===box.height&&canvas.width===Math.round(box.width*dpr))return;
  width=box.width;height=box.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);lastFrame=-1;
 }
 function paint(now){
  if(!active)return;
  size();
  let seconds=(now-clock)/1000;
  if(!images)seconds=Math.min(seconds,.6);
  else if(seconds>=9){scene=pick(scene.id);clock=now;seconds=0;}
  const frame=Math.floor(seconds*24);
  if(lastFrame!==frame||reduced()){
   renderSketchFrame(context,{width,height,seconds,scene,materials,reduced:reduced()});
   canvas.dataset.frame=String(frame);canvas.dataset.scene=scene.id;canvas.dataset.ready=images?'true':'drawing';lastFrame=frame;
  }
  if(!reduced())frameId=requestAnimationFrame(paint);
 }
 function resume(reset=false){
  cancelAnimationFrame(frameId);if(reset){clock=performance.now();scene=pick(scene.id)}
  active=window.__bayitSplash?.visible!==false;sync();if(active)paint(performance.now());
 }
 addEventListener('bayit:splash-show',()=>resume(true));
 addEventListener('bayit:splash-hide',()=>{active=false;cancelAnimationFrame(frameId)});
 addEventListener('resize',()=>{size();if(active&&reduced())paint(performance.now())});
 media.addEventListener('change',()=>resume());
 new MutationObserver(()=>resume()).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-motion','lang']});
 sync();size();if(active)paint(performance.now());
 Promise.all(['cobalt','yellow'].map(name=>new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>resolve([name,image]);image.onerror=reject;image.src='/assets/shell-20261107/paper-'+name+'-small.png';
 }))).then(entries=>{images=Object.fromEntries(entries);clock=performance.now()-Math.min((performance.now()-clock),600);resume()}).catch(()=>{
  // Decorative imagery never controls application readiness or sign-in.
  canvas.dataset.ready='unavailable';
 });
}
