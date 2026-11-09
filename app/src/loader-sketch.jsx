import {useEffect,useRef} from 'react';
const rendererUrl=new URL('/assets/shell-20261107/sketch-renderer.js',location.origin).href;
let rendererPromise;
const loadRenderer=()=>rendererPromise??=import(/* @vite-ignore */ rendererUrl);

const paperSources={cobalt:'/assets/shell-20261107/paper-cobalt-small.png',yellow:'/assets/shell-20261107/paper-yellow-small.png'};
let paperPromise;
const loadPaper=()=>paperPromise??=Promise.all(Object.entries(paperSources).map(([name,source])=>new Promise((resolve,reject)=>{
  const image=new Image();image.src=source;image.onload=()=>resolve([name,image]);image.onerror=reject;
}))).then(entries=>Object.fromEntries(entries));

export function SketchCanvas({scene,theme,reduced,active=true,duration=9000,replayKey,once=false}) {
  const ref=useRef(null);
  const activeRef=useRef(active);
  activeRef.current=active;
  useEffect(()=>{
    const canvas=ref.current;
    const context=canvas.getContext('2d');
    let stopped=false,frameId=0,lastPaint=-1,width=0,height=0,materials,clockStart=performance.now(),renderFrame;
    const resize=()=>{
      const box=canvas.getBoundingClientRect();
      const ratio=Math.min(devicePixelRatio||1,2);
      if(width===box.width&&height===box.height&&canvas.width===Math.round(box.width*ratio))return;
      width=box.width;height=box.height;
      canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      context.setTransform(ratio,0,0,ratio,0,0);
      lastPaint=-1;
      if(materials&&(once||reduced||!activeRef.current))draw(performance.now());
    };
    resize();
    const observer=new ResizeObserver(resize);observer.observe(canvas);
    const draw=now=>{
      if(stopped||!materials)return;
      const seconds=once?Math.min(4,(now-clockStart)/1000):(now-clockStart)/1000;
      const frame=Math.floor(seconds*24);
      if(lastPaint!==frame||reduced) {
        renderFrame(context,{width,height,seconds,scene,materials,reduced,duration:duration/1000});
        canvas.dataset.frame=String(frame);
        canvas.dataset.seconds=seconds.toFixed(3);
        lastPaint=frame;
      }
      if(activeRef.current&&!reduced&&(!once||seconds<4))frameId=requestAnimationFrame(draw);
    };
    Promise.all([loadPaper(),loadRenderer()]).then(([images,rendering])=>{
      if(stopped)return;
      renderFrame=rendering.renderSketchFrame;
      materials={...rendering.createMaterials(context,images,theme==='dark'),night:theme==='dark'};
      canvas.dataset.ready='true';
      clockStart=performance.now();draw(clockStart);
    }).catch(()=>{if(!stopped)canvas.dataset.ready='error';});
    return()=>{stopped=true;cancelAnimationFrame(frameId);observer.disconnect();};
  },[scene,theme,reduced,duration,replayKey,once]);
  return <canvas ref={ref} className="bayit-sketch-canvas" aria-hidden="true" data-style="sketch-paper"
    data-engine="frame-by-frame-canvas" />;
}
