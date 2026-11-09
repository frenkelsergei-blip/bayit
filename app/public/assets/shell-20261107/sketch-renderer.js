// The user explicitly requested JavaScript-drawn sketch motion. The logo remains
// its supplied PNG; these animated decorative contours use real paper materials.
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const out = value => 1 - (1 - clamp(value)) ** 3;
const smooth = value => { const v = clamp(value); return v * v * (3 - 2 * v); };
const at = (time, start, duration, ease = out) => ease((time - start) / duration);
const wave = (index, seed = 0) => Math.sin(index * 1.731 + seed * .0013) * .62
  + Math.sin(index * 3.197 + seed * .0007) * .38;

function part(points, progress, from = 0) {
  if (progress <= from || points.length < 2) return [];
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0]-points[i][0],point[1]-points[i][1]));
  const total = lengths.reduce((a,b) => a+b,0);
  const start = total * from;
  const end = total * Math.min(1,progress);
  let distance = 0;
  const selected = [];
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (distance+length >= start && distance <= end) {
      const low = Math.max(0,(start-distance)/length);
      const high = Math.min(1,(end-distance)/length);
      const point = ratio => [points[i][0]+(points[i+1][0]-points[i][0])*ratio,
        points[i][1]+(points[i+1][1]-points[i][1])*ratio];
      if (!selected.length) selected.push(point(low));
      selected.push(point(high));
    }
    distance += length;
  }
  return selected;
}

function trace(context, points, progress, color, weight, seed, frame, ghost = false) {
  const visible = part(points,progress);
  if (visible.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    context.globalAlpha = (pass ? .24 : .83) * (ghost ? .4 : 1);
    context.lineWidth = weight * (pass ? .55 : 1);
    context.beginPath();
    visible.forEach(([x,y],i) => {
      const jitter = wave(i*.71+pass*12,seed+frame%3*127) * (pass ? 1.8 : .5);
      if (i === 0) context.moveTo(x+jitter,y+jitter*.65);
      else context.lineTo(x+jitter,y+jitter*.65);
    });
    context.stroke();
  }
  // A tiny graphite tip shows where the line is currently being drawn.
  if (progress < .99 && !ghost) {
    const [x,y] = visible.at(-1);
    context.globalAlpha = .95;
    context.fillStyle = color;
    context.beginPath();context.arc(x,y,weight*.75,0,TAU);context.fill();
  }
  context.restore();
}

function polygon(points) {
  const path = new Path2D();
  points.forEach(([x,y],i) => i ? path.lineTo(x,y) : path.moveTo(x,y));
  path.closePath();return path;
}

function circlePoints(cx,cy,r,seed,steps = 96) {
  return Array.from({length:steps+1},(_,i) => {
    const angle = i/steps*TAU - Math.PI/2;
    const radius = r + wave(i*.8,seed)*.75;
    return [cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius];
  });
}

function arcPoints(cx,cy,r,start,end,seed,steps = 110) {
  return Array.from({length:steps+1},(_,i) => {
    const angle = start+(end-start)*i/steps;
    const radius = r+wave(i,seed)*.7;
    return [cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius];
  });
}

function paper(context,path,material,night,shadow = 1) {
  context.save();
  context.fillStyle = material;
  context.shadowColor = night ? `rgba(0,0,0,${.38*shadow})` : `rgba(22,24,35,${.16*shadow})`;
  context.shadowBlur = 7 * shadow;
  context.shadowOffsetX = 1.5 * shadow;
  context.shadowOffsetY = 4 * shadow;
  context.fill(path);
  context.restore();
}

function sun(context,{cx,cy,r,time,seed,frame,ink,yellow,night,unit}) {
  const points = circlePoints(cx,cy,r,seed);
  const outline = at(time,.08,1.35);
  const unfold = at(time,.72,1.15);
  trace(context,points,outline,ink,1.65*unit,seed,frame,true);
  if (unfold > 0) {
    context.save();
    context.translate(cx,cy);
    context.rotate(-.15 * (1-unfold));
    const settle = unfold + Math.sin(unfold*Math.PI) * .065;
    context.scale(settle,Math.max(.012,unfold*unfold));
    context.translate(-cx,-cy);
    paper(context,polygon(points),yellow,night,1-unfold*.45);
    trace(context,points,outline,ink,1.1*unit,seed+92,frame);
    context.restore();
  }
  // Three hand-drawn rays arrive one stroke at a time, not all at once.
  for (let i=0;i<3;i++) {
    const angle = -1.35+i*.3;
    const start = [cx+Math.cos(angle)*(r+12*unit),cy+Math.sin(angle)*(r+12*unit)];
    const end = [cx+Math.cos(angle)*(r+(i===1?35:28)*unit),cy+Math.sin(angle)*(r+(i===1?35:28)*unit)];
    trace(context,[start,end],at(time,1.45+i*.14,.35),ink,1.8*unit,seed+i,frame);
  }
}

function hatch(context,x,y,time,ink,unit,seed,frame) {
  for (let i=0;i<3;i++) {
    trace(context,[[x+i*8*unit,y],[x+(i*8+12)*unit,y-12*unit]],
      at(time,2.1+i*.11,.28),ink,1.1*unit,seed+i,frame,true);
  }
}

function horizon(context,p) {
  const {width:w,height:h,time,seed,frame,ink,blue,yellow,night,unit,mobile} = p;
  const points = Array.from({length:121},(_,i) => {
    const u = i/120;
    return [-.04*w+1.08*w*u, h*(.96-.185*Math.sin(Math.PI*u)) + wave(i*.47,seed)*.8];
  });
  const fold = at(time,.8,1.65,smooth);
  const disc = {cx:w*(mobile?.81:.83),cy:h*.84,r:Math.min(w*(mobile?.17:.09),h*.135)};
  sun(context,{...disc,time:time-.18,seed:seed+37,frame,ink,yellow,night,unit});
  trace(context,points,at(time,.05,1.55),ink,2.0*unit,seed,frame);
  if (fold>0) {
    // Material unfolds from the curved sketched edge, like a paper ribbon.
    // Both edges remain curved throughout; no rectangular image wipe.
    const top = part(points,at(time,.4,1.7));
    const bottom = top.map(([x,y],i)=>[x,y+(h*1.14-y)*fold+wave(i,seed)*.4]);
    paper(context,polygon([...top,...bottom.reverse()]),blue,night);
  }
  trace(context,points,at(time,.25,1.6),ink,.9*unit,seed+127,frame);
  hatch(context,w*.16,h*.91,time,night?'#b7c9ff':'#dce5ff',unit,seed,frame);
}

function corners(context,p) {
  const {width:w,height:h,time,seed,frame,ink,blue,yellow,night,unit,mobile} = p;
  const capsuleWidth = w*(mobile?.19:.20);
  const x = mobile ? -.09*w : -.018*w;
  const right = x+capsuleWidth;
  const radius = capsuleWidth/2;
  const capY = Math.min(h*.32,w*.23);
  const outline = [[right,-30],[right,capY],...arcPoints(x+radius,capY,radius,0,Math.PI,seed,55),[x,-30]];
  trace(context,outline,at(time,.08,1.2),ink,1.6*unit,seed,frame);
  const unfold = at(time,.53,1.38,smooth);
  if (unfold>0) {
    context.save();
    context.translate(x+radius,-10);
    context.rotate((1-unfold)*-.045);
    context.scale(.06+.94*unfold,1);
    context.translate(-x-radius,10);
    paper(context,polygon(outline),blue,night);
    trace(context,outline,at(time,.08,1.2),ink,.85*unit,seed+8,frame);
    context.restore();
  }
  const r = Math.min(w*(mobile?.53:.34),h*.54);
  const cx = w+8*unit,cy=h+8*unit;
  const a0=Math.PI,a1=1.5*Math.PI;
  const band=r*.30;
  const outer=arcPoints(cx,cy,r,a0,a1,seed+31);
  const inner=arcPoints(cx,cy,r-band,a0,a1,seed+81);
  trace(context,outer,at(time,.3,1.35),ink,1.65*unit,seed+90,frame);
  trace(context,inner,at(time,.55,1.30),ink,1.2*unit,seed+23,frame,true);
  const curl=at(time,1.05,1.55,smooth);
  if(curl>0) {
    const end=a0+(a1-a0)*curl;
    const contour=[...arcPoints(cx,cy,r,a0,end,seed+31),
      ...arcPoints(cx,cy,r-band,end,a0,seed+81)];
    paper(context,polygon(contour),yellow,night);
    trace(context,outer,curl,ink,.95*unit,seed+90,frame);
    trace(context,inner,curl,ink,.8*unit,seed+23,frame);
  }
  const hAngle = Math.PI*1.27;
  hatch(context,cx+Math.cos(hAngle)*(r-band*.5),cy+Math.sin(hAngle)*(r-band*.5),
    time,ink,unit,seed+187,frame);
}

function orbit(context,p) {
  const {width:w,height:h,time,seed,frame,ink,blue,yellow,night,unit,mobile} = p;
  const r = mobile ? w*.48 : Math.min(h*.40,w*.29);
  const cx = w*(mobile?1.055:1.025),cy = h*(mobile?.98:.65);
  const band=r*.23;
  const start=Math.PI*1.54,end=Math.PI*.44;
  const outside=arcPoints(cx,cy,r,start,end,seed);
  const inside=arcPoints(cx,cy,r-band,start,end,seed+91);
  trace(context,outside,at(time,.06,1.6),ink,1.6*unit,seed,frame);
  trace(context,inside,at(time,.35,1.65),ink,1.1*unit,seed+91,frame,true);
  const unfurl=at(time,.7,1.85,smooth);
  if(unfurl>0) {
    const angle=start+(end-start)*unfurl;
    paper(context,polygon([...arcPoints(cx,cy,r,start,angle,seed),
      ...arcPoints(cx,cy,r-band,angle,start,seed+91)]),blue,night);
    trace(context,outside,unfurl,ink,.95*unit,seed+51,frame);
    trace(context,inside,unfurl,ink,.85*unit,seed+124,frame);
  }
  const arrive=at(time,.55,1.7,smooth);
  const discX = cx-r*(.51-.12*arrive);
  const discY = cy+r*(.48-.32*arrive);
  sun(context,{cx:discX,cy:discY,r:r*.20,time:time-.3,seed:seed+217,
    frame,ink,yellow,night,unit});
}

export function createMaterials(context,images,night) {
  const materials={};
  for(const name of ['cobalt','yellow']) {
    const pattern=context.createPattern(images[name],'repeat');
    pattern.setTransform(new DOMMatrix().scale(520/images[name].width));
    materials[name]=pattern;
  }
  return {blue:materials.cobalt,yellow:materials.yellow,
    ink:night?'#c9d4ec':'#172b50'};
}

export function renderSketchFrame(context,{width,height,seconds,scene,materials,reduced=false,duration=9}) {
  context.clearRect(0,0,width,height);
  const phase = reduced ? 4 : seconds % duration;
  // The drawings are traced, built, held, and unwound in real geometry. There
  // is no image/scene opacity transition. The final .4s is a quiet paper beat.
  const retractStart=duration*.73;
  const retractEnd=duration*.955;
  const time=phase<retractStart ? phase : 3*(1-smooth((phase-retractStart)/(retractEnd-retractStart)));
  const frame=Math.floor(seconds*12);
  const unit=Math.max(.8,Math.min(1.6,width/1100));
  const params={width,height,time,frame,unit,mobile:width<700&&height>width*.85,
    seed:scene.seed||37,night:materials.night,...materials};
  context.save();
  if(scene.mirror) { context.translate(width,0);context.scale(-1,1); }
  const draw={horizon,corners,orbit}[scene.id]||horizon;
  draw(context,params);
  context.restore();
  return {phase,time,frame};
}
