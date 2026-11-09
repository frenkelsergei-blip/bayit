// Visual-only rigid silhouettes measured from the actual grocery PNG alpha.
import groceries from './hero-cart-groceries.json' with {type:'json'};
export const CART_FLOOR=.804,CART_LEFT=.218,CART_RIGHT=.925;
const hash=text=>{let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const fallback={ratio:1,hull:[[0,0],[1,0],[1,1],[0,1]]};
export const cartGroceryArt=item=>groceries[typeof item==='string'?item:item.id]?.image||item.image;
export function cartGrocerySourceBox(item,box,trimmed=false){const g=groceries[item.id],b=g?.bounds;if(!b)return box;if(trimmed){const width=Math.min(box.width,box.height*g.ratio),height=width/g.ratio;return {x:box.x+(box.width-width)/2,y:box.y+box.height-height,width,height}}const side=Math.min(box.width,box.height);return {x:box.x+(box.width-side)/2+side*b.x/b.sourceWidth,y:box.y+(box.height-side)/2+side*b.y/b.sourceHeight,width:side*b.width/b.sourceWidth,height:side*b.height/b.sourceHeight}}
export function cartPileKeys(items){const seen={};return items.map(item=>{const id=typeof item==='string'?item:item.id,n=seen[id]||0;seen[id]=n+1;return id+':'+n})}
function shape(body){const g=groceries[body.id]||fallback,iw=body.width,ih=iw/g.ratio,rad=body.angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad),poly=g.hull.map(([u,v])=>{const x=(u-.5)*iw,y=v*ih+(body.height-ih)-body.height/2;return [x*cos-y*sin,x*sin+y*cos]});return {poly,minX:Math.min(...poly.map(p=>p[0])),maxX:Math.max(...poly.map(p=>p[0])),minY:Math.min(...poly.map(p=>p[1])),maxY:Math.max(...poly.map(p=>p[1]))}}
function pairAxes(a,b){const axes=[];for(const s of [a,b])for(let i=0;i<s.poly.length;i++){const p=s.poly[i],q=s.poly[(i+1)%s.poly.length],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);if(!length)continue;const nx=-dy/length,ny=dx/length;if(axes.some(k=>Math.abs(k.nx*nx+k.ny*ny)>.9995))continue;const ap=a.poly.map(p=>p[0]*nx+p[1]*ny),bp=b.poly.map(p=>p[0]*nx+p[1]*ny);axes.push({nx,ny,amin:Math.min(...ap),amax:Math.max(...ap),bmin:Math.min(...bp),bmax:Math.max(...bp)})}return axes}
function collision(a,b,axes){let depth=Infinity,axis=null;for(const n of axes){const ap=a.x*n.nx+a.y*n.ny,bp=b.x*n.nx+b.y*n.ny,overlap=Math.min(n.amax+ap,n.bmax+bp)-Math.max(n.amin+ap,n.bmin+bp);if(overlap<=0)return null;if(overlap<depth){depth=overlap;const sign=(b.x-a.x)*n.nx+(b.y-a.y)*n.ny>=0?1:-1;axis={x:n.nx*sign,y:n.ny*sign}}}return {depth,...axis}}
export function cartBodyBounds(body){const s=shape(body);return {left:body.x+s.minX,right:body.x+s.maxX,top:body.y+s.minY,bottom:body.y+s.maxY}}
export function cartBodiesOverlap(a,b){return collision(a,b,pairAxes(shape(a),shape(b)))?.depth||0}
export function settleCartPile(items,previous=[],capacity=5){
 const keys=cartPileKeys(items),old=new Map(previous.map(b=>[b.key,b]));
 const bodies=keys.map((key,index)=>{const id=typeof items[index]==='string'?items[index]:items[index].id,g=groceries[id]||fallback,h=hash(key),p=old.get(key),width=Math.min(capacity<=3?.30:.27,(capacity<=3?.29:.235)*g.ratio),height=Math.max(.17,width/g.ratio);return {key,id,index,x:p?.x??(.335+((index*.618+(h%100)/1000)%1)*.44),y:p?.y??(.15-index*.08),vx:0,vy:0,width,height,angle:(h%7)-3}});
 const shapes=bodies.map(shape),pairs=[];for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)pairs.push({a:bodies[i],b:bodies[j],axes:pairAxes(shapes[i],shapes[j])});
 for(let tick=0;tick<520;tick++){
  for(const b of bodies){b.vy=Math.min(.019,(b.vy+.00012)*.987);b.x+=b.vx;b.y+=b.vy;b.vx*=.94}
  for(let solve=0;solve<6;solve++){
   for(const {a,b,axes} of pairs){const hit=collision(a,b,axes);if(!hit)continue;const move=(hit.depth+.000002)*.501;a.x-=hit.x*move;a.y-=hit.y*move;b.x+=hit.x*move;b.y+=hit.y*move;if(hit.y>.55)b.vy=Math.min(b.vy,0);else if(hit.y<-.55)a.vy=Math.min(a.vy,0)}
   for(let i=0;i<bodies.length;i++){const b=bodies[i],s=shapes[i];b.x=Math.max(CART_LEFT-s.minX,Math.min(CART_RIGHT-s.maxX,b.x));if(b.y+s.maxY>CART_FLOOR){b.y=CART_FLOOR-s.maxY;b.vy=0;b.vx*=.4}}
  }
 }
 // Finish projection without adding gravity; floor contacts must not retain penetration.
 for(let pass=0;pass<180;pass++){
  for(const {a,b,axes} of pairs){const hit=collision(a,b,axes);if(!hit)continue;let wa=.5,wb=.5;
   if(hit.y>.4&&b.y+shapes[b.index].maxY>CART_FLOOR-.003){wa=1;wb=0}
   else if(hit.y<-.4&&a.y+shapes[a.index].maxY>CART_FLOOR-.003){wa=0;wb=1}
   const move=hit.depth+.000003;a.x-=hit.x*move*wa;a.y-=hit.y*move*wa;b.x+=hit.x*move*wb;b.y+=hit.y*move*wb;
  }
  for(let i=0;i<bodies.length;i++){const b=bodies[i],s=shapes[i];b.x=Math.max(CART_LEFT-s.minX,Math.min(CART_RIGHT-s.maxX,b.x));b.y=Math.min(CART_FLOOR-s.maxY,b.y)}
 }
 return bodies.map(({vx,vy,...b})=>b);
}
