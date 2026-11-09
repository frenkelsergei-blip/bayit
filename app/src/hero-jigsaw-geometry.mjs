// Interlocking contours clip the real picture; these are game geometry, not drawn artwork.
export function jigsawEdges(index){
 const row=Math.floor(index/4),col=index%4;
 const right=(r,c)=>(r+c)%2?1:-1,bottom=(r,c)=>(r*3+c)%2?-1:1;
 return [row===0?0:-bottom(row-1,col),col===3?0:right(row,col),row===3?0:bottom(row,col),col===0?0:-right(row,col-1)];
}
export function traceJigsaw(ctx,index,aspect=1.5){
 const edges=jigsawEdges(index);
 const point=(edge,t,n)=>edge===0?[t,n]:edge===1?[100-n,t]:edge===2?[100-t,100-n]:[n,100-t];
 ctx.beginPath();ctx.moveTo(0,0);
 edges.forEach((sign,edge)=>{
  // Compensate only the tabs for the 3:2 photograph. Their physical curves
  // stay round while the picture and board retain the original aspect ratio.
  const tab=(t,n)=>point(edge,edge%2===0?50+(t-50)/aspect:t,edge%2===0?n:n/aspect);
  const line=(x,y)=>ctx.lineTo(...(x===100?point(edge,x,y):tab(x,y)));
  const curve=(x1,y1,x2,y2,x3,y3)=>ctx.bezierCurveTo(...tab(x1,y1*sign),...tab(x2,y2*sign),...tab(x3,y3*sign));
  if(!sign){line(100,0);return}
  line(34,0);curve(40,0,41,2,40,-3);curve(35,-14,42,-21,50,-21);curve(58,-21,65,-14,60,-3);curve(59,2,60,0,66,0);line(100,0);
 });
 ctx.closePath();
}
