/* Weighted source-to-sink decomposition of edge currents; shared scale for both colours and all times. */
(function(root){
'use strict';
const A=root.HexArt,F=root.HexFlow,ink='#183f42',clay='#b36d59',paper='#f3f0e8';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const num=v=>(+v.toFixed(3)).toString(),fmt=v=>v===0?'0':v.toFixed(2);
function width(q){return 2*Math.asinh(q);}
function selected(flow,density){return flow.routes.slice(0,density*4);}
function coverage(flow,density){return flow.current?selected(flow,density).reduce((a,r)=>a+r.current,0)/flow.current:0;}
function points(route,n,color){let hash=2166136261;for(const i of route.nodes)hash=Math.imul(hash^i,16777619)>>>0;const angle=(hash%65536)/65536*Math.PI*2,radius=.6+2.4*((hash>>>16)/65535),dx=radius*Math.cos(angle),dy=radius*Math.sin(angle);const pts=route.nodes.map(i=>{const p=A.position(i%n,Math.floor(i/n),n);return [p[0]+dx,p[1]+dy];}),unit=color===0?[-245/(n-1),650/(n-1)]:[790/(n-1),130/(n-1)];return [[pts[0][0]-unit[0]*.5,pts[0][1]-unit[1]*.5],...pts,[pts.at(-1)[0]+unit[0]*.5,pts.at(-1)[1]+unit[1]*.5]];}
function rounded(pts){
 let d='M'+pts[0].map(num).join(',');
 for(let i=1;i<pts.length-1;i++){const a=pts[i-1],b=pts[i],c=pts[i+1],l1=Math.hypot(a[0]-b[0],a[1]-b[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]),r=Math.min(5,l1*.16,l2*.16),p=[b[0]+(a[0]-b[0])*r/l1,b[1]+(a[1]-b[1])*r/l1],q=[b[0]+(c[0]-b[0])*r/l2,b[1]+(c[1]-b[1])*r/l2];d+='L'+p.map(num).join(',')+'Q'+b.map(num).join(',')+' '+q.map(num).join(',');}
 return d+'L'+pts.at(-1).map(num).join(',');
}
function buildSVG(game,meta,fields,opts={}){
 const step=opts.step??game.moves.length,mode=opts.mode??'strata',history=opts.history??.65,density=opts.density??18,n=game.n,ref=F.reference(n),pair=fields[step],first=mode==='strata'?Math.min(1,step):step,colors=[ink,clay],s=[];
 const title=meta.title||meta.file;
 s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1300" viewBox="0 0 1400 1300" role="img" aria-label="${esc(title)}: current flow"><title>${esc(title)} / HEX CURRENT</title><desc>Unit-voltage resistor model. Opponent cells are removed; own resistance .04, empty 1. Threads decompose directed edge currents. Shared asinh width scale for both colours and every recorded position. Rounded corners stay near the graph; deterministic lanes offset each route by at most 3 SVG pixels without changing its cells or current. Empty-cell paths are potential only, not guaranteed connections or win probabilities. Small routes are omitted from the drawing, not from total conductance.</desc><rect width="1400" height="1300" fill="${paper}"/><defs><clipPath id="field"><path d="M285,250 L1075,380 L830,1030 L40,900 Z"/></clipPath></defs>`);
 s.push(`<g font-family="Georgia,serif" fill="${ink}"><text x="60" y="75" font-size="23" letter-spacing="5">HEX / CURRENT</text><text x="60" y="117" font-size="14" letter-spacing="2">BETWEEN TWO BANKS.</text></g><g data-export="summary" fill="#6c7067" font-family="Arial,sans-serif" font-size="13" letter-spacing="1"><text x="1340" y="75" text-anchor="end">${esc(meta.date)} · ${n} × ${n}</text><text x="1340" y="100" text-anchor="end">${esc(title)}</text><text x="1340" y="125" text-anchor="end">${step} / ${game.moves.length} RECORDED EVENTS · ${mode==='strata'?'STRATA':'SINGLE POSITION'}</text></g>`);
 s.push(`<g data-export="art" transform="translate(105,0)"><g fill="none" stroke-width="1.3" opacity=".3"><path d="M285,250L1075,380M40,900L830,1030" stroke="${ink}"/><path d="M285,250L40,900M1075,380L830,1030" stroke="${clay}"/></g><g clip-path="url(#field)" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
 for(let t=first;t<=step;t++){
  if(!fields[t]||(mode==='strata'&&['resign','forfeit'].includes(game.frames[t].move?.type)))continue;
  const alpha=mode==='position'?.44:(.006+history*.025)*(.3+.7*t/Math.max(1,step));
  const routes=fields[t].map(f=>selected(f,density));
  // Interleave colours by route rank, alternating first colour across time.
  for(let k=Math.max(...routes.map(r=>r.length))-1;k>=0;k--)for(const c of (t%2?[0,1]:[1,0])){const route=routes[c][k];if(!route)continue;const key='flow:'+t+':'+c+':'+k;let d=opts.paths?.get(key);if(!d){d=rounded(points(route,n,c));opts.paths?.set(key,d);}const w=width(n*route.current/ref);s.push(`<path data-flow="${route.current}" data-color="${c+1}" d="${d}" stroke="${colors[c]}" stroke-width="${num(w)}" opacity="${alpha.toFixed(4)}"/>`);}
 }
 if(mode==='position')for(let c=0;c<2;c++)for(const route of selected(pair[c],density).slice(0,6)){const pts=points(route,n,c),k=Math.max(1,Math.floor(pts.length*.58)),a=pts[k-1],b=pts[k],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,l=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/l,dy=(b[1]-a[1])/l;s.push(`<path d="M${num(x-4*dx-2.5*dy)},${num(y-4*dy+2.5*dx)}L${num(x)},${num(y)}L${num(x-4*dx+2.5*dy)},${num(y-4*dy-2.5*dx)}" stroke="${colors[c]}" stroke-width=".8" opacity=".8"/>`);}
 s.push('</g>');
 if(opts.board){const frame=game.frames[step];for(let i=0;i<n*n;i++){const c=frame.board[i];if(!c)continue;const [x,y]=A.position(i%n,Math.floor(i/n),n);s.push(`<circle cx="${num(x)}" cy="${num(y)}" r="5" fill="${colors[c-1]}" stroke="${paper}" stroke-width="1.8"/>`);}if(frame.move?.pos!==undefined){const i=frame.move.pos,[x,y]=A.position(i%n,Math.floor(i/n),n);s.push(`<circle cx="${num(x)}" cy="${num(y)}" r="9" fill="none" stroke="${ink}"/>`);}}
 s.push('</g>');
 const state=pair.map(f=>f.actual?'STONE CONNECTION':f.potentialConnected?'VIA EMPTY CELLS':'BLOCKED');
 s.push(`<g font-family="Arial,sans-serif" font-size="11" fill="#6c7067" letter-spacing=".8"><text x="60" y="185">TEAL ↓ TOP TO BOTTOM · CLAY → LEFT TO RIGHT</text><text x="1340" y="185" text-anchor="end">OPPONENT CELLS DO NOT CONDUCT</text><text x="60" y="1080">TOTAL CONDUCTANCE / EMPTY BOARD = 1</text><text x="1340" y="1080" text-anchor="end">BLACK ${fmt(pair[0].conductance/ref)} · WHITE ${fmt(pair[1].conductance/ref)}</text><text x="60" y="1104" fill="${ink}">BLACK: ${state[0]}</text><text x="1340" y="1104" text-anchor="end" fill="${clay}">WHITE: ${state[1]}</text></g>`);
 const max=Math.max(1,...fields.flatMap(p=>p.map(f=>f.conductance/ref))),chartX=180,chartY=1182,chartW=1040,chartH=55,scale=Math.log1p(max);
 s.push(`<path d="M${chartX},${chartY}H${chartX+chartW}" stroke="#d4d1c8"/><path d="M${chartX},${num(chartY-chartH*Math.log(2)/scale)}H${chartX+chartW}" stroke="#d4d1c8" stroke-dasharray="3 5"/><text x="130" y="${num(chartY-chartH*Math.log(2)/scale+3)}" font-family="Arial" font-size="9" fill="#798073">1×</text>`);
 for(let c=0;c<2;c++){let d='';for(let t=0;t<=step;t++){const x=chartX+chartW*t/Math.max(1,game.moves.length),y=chartY-chartH*Math.log1p(fields[t][c].conductance/ref)/scale;d+=(t?'L':'M')+num(x)+','+num(y);}s.push(`<path d="${d}" fill="none" stroke="${colors[c]}" stroke-width="1.5"/>`);}
 s.push(`<g font-family="Arial,sans-serif" font-size="10" fill="#6c7067" letter-spacing=".7"><text x="60" y="1220">LOCAL THREAD CURRENT / (EMPTY TOTAL ÷ ${n})</text>`);
 for(const [k,q] of [.25,1,4].entries()){const x=525+k*150;s.push(`<path d="M${x},1217h45" stroke="${ink}" stroke-width="${num(width(q))}"/><text x="${x+55}" y="1220">${q}×</text>`);}
 s.push(`<text x="1340" y="1220" text-anchor="end">SHARED ASINH WIDTH SCALE</text><text x="60" y="1250">${esc(meta.collectionLabel)} · ${game.placements} PLACEMENTS · NO ADDED MOVES</text><text x="1340" y="1250" text-anchor="end">VISIBLE FLOW: B ${Math.round(100*coverage(pair[0],density))}% / W ${Math.round(100*coverage(pair[1],density))}%</text><text x="1340" y="1272" text-anchor="end">TOTALS INCLUDE OMITTED THREADS · NOT A WIN PROBABILITY</text></g></svg>`);
 return s.join('');
}
root.HexCurrentArt={buildSVG,coverage,width,rounded};if(typeof module!=='undefined')module.exports=root.HexCurrentArt;
})(typeof globalThis!=='undefined'?globalThis:this);