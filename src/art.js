(function(root){
'use strict';
const W=1400,H=1300,ink='#183f42',rust='#b36d59',paper='#f3f0e8';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function position(x,y,n){const u=x/(n-1),v=y/(n-1);return [285+790*u-245*v,250+130*u+650*v];}
function number(v){return (+v.toFixed(2)).toString();}
function smooth(points){if(points.length<2)return '';let d='M'+points[0].map(number).join(',');for(let i=0;i<points.length-1;i++){const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];d+='C'+[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6,p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6,p2[0],p2[1]].map(number).join(',');}return d;}
function contours(values,n,count){
 const all=[];
 for(let levelIndex=1;levelIndex<=count;levelIndex++){
  const level=levelIndex/(count+1),segments=[],nodes=new Map();
  const id=p=>p.map(v=>v.toFixed(5)).join(':');
  function triangle(ids){let hit=[];for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],va=values[a],vb=values[b];if((va<level&&vb>=level)||(vb<level&&va>=level)){const t=(level-va)/(vb-va);hit.push([a%n+(b%n-a%n)*t,Math.floor(a/n)+(Math.floor(b/n)-Math.floor(a/n))*t]);}}
   if(hit.length===2){const index=segments.length;segments.push(hit);for(const p of hit){const key=id(p);if(!nodes.has(key))nodes.set(key,[]);nodes.get(key).push(index);}}
  }
  for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){const a=y*n+x,b=a+1,c=a+n,d=c+1;triangle([a,b,c]);triangle([b,d,c]);}
  const used=new Set();
  function walk(index,start){const line=[start];let key=id(start);while(index!==undefined&&!used.has(index)){used.add(index);const s=segments[index],next=id(s[0])===key?s[1]:s[0];line.push(next);key=id(next);index=nodes.get(key).find(k=>!used.has(k));}return line;}
  for(const [key,links]of nodes)if(links.length===1&&!used.has(links[0])){const s=segments[links[0]],start=id(s[0])===key?s[0]:s[1];all.push(walk(links[0],start).map(p=>position(...p,n)));}
  for(let i=0;i<segments.length;i++)if(!used.has(i))all.push(walk(i,segments[i][0]).map(p=>position(...p,n)));
 }
 return all.map(smooth).join('');
}
function prepareFrame(frame,n){return [1,2].map(c=>root.HexCore.solvePotential(frame.board,n,c));}
function buildSVG(game,meta,fields,opts={}){
 const step=Math.min(opts.step??game.moves.length,game.moves.length),history=opts.history??.65,density=opts.density??18,mode=opts.mode??'strata',boardVisible=opts.board??false,paths=opts.paths;
 const title=meta.title||meta.file,frame=game.frames[step],begin=mode==='strata'?1:step;
 const s=[];s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: Hex connection potential strata"><title>${esc(title)} — HEX STRATA</title><desc>Each layer is one recorded position. Teal: Black top to bottom. Clay: White left to right. Regularized resistance potential contours, not winning probabilities or actual connections. Recorded ending preserved.</desc><rect width="1400" height="1300" fill="${paper}"/><defs><clipPath id="field"><path d="M285,250 L1075,380 L830,1030 L40,900 Z"/></clipPath></defs>`);
 s.push(`<g font-family="Georgia,serif" fill="${ink}"><text x="60" y="75" font-size="23" letter-spacing="5">HEX / STRATA</text><text x="60" y="117" font-size="14" letter-spacing="2">A GAME, SEDIMENTED.</text></g><g data-export="summary" fill="#6c7067" font-family="Arial,sans-serif" font-size="13" letter-spacing="1"><text x="1340" y="75" text-anchor="end">${esc(meta.date||'')} · ${game.n} × ${game.n}</text><text x="1340" y="100" text-anchor="end">${esc(title)}</text><text x="1340" y="125" text-anchor="end">${step} / ${game.moves.length} RECORDED EVENTS</text></g>`);
 s.push('<g data-export="art" transform="translate(105,0)">');
 const border=[[[285,250],[1075,380],ink],[[40,900],[830,1030],ink],[[285,250],[40,900],rust],[[1075,380],[830,1030],rust]];
 for(const [a,b,c]of border)s.push(`<path d="M${a}L${b}" fill="none" stroke="${c}" stroke-width="1.3" opacity=".22"/>`);
 s.push('<g clip-path="url(#field)" fill="none" stroke-linecap="round" stroke-linejoin="round">');
 const first=Math.max(0,begin);
 for(let t=first;t<=step;t++){
  if(!fields[t])continue;if(t>0&&['resign','forfeit'].includes(game.frames[t].move.type)&&mode==='strata')continue;
  const age=step? t/step:1,alpha=mode==='position'?.66:(.008+history*.048)*(.28+.72*age);
  for(let c=0;c<2;c++){
   const key=t+':'+c+':'+density;let d=paths?.get(key);if(!d){d=contours(fields[t][c].v,game.n,density);paths?.set(key,d);}
   s.push(`<path d="${d}" stroke="${c?rust:ink}" opacity="${alpha.toFixed(4)}" stroke-width="${mode==='position'?1.35:.85}"/>`);
  }
 }
 // A fine, quieter contour of the visible position keeps the current moment legible.
 if(mode==='strata'&&fields[step])for(let c=0;c<2;c++)s.push(`<path d="${contours(fields[step][c].v,game.n,9)}" stroke="${c?rust:ink}" opacity=".27" stroke-width=".9"/>`);
 s.push('</g>');
 if(boardVisible){s.push('<g>');for(let i=0;i<game.n*game.n;i++){const c=frame.board[i];if(!c)continue;const [x,y]=position(i%game.n,Math.floor(i/game.n),game.n);s.push(`<circle cx="${number(x)}" cy="${number(y)}" r="5" fill="${c===1?ink:rust}" opacity=".9" stroke="${paper}" stroke-width="1.8"/>`);}if(frame.move?.pos!==undefined){const [x,y]=position(frame.move.pos%game.n,Math.floor(frame.move.pos/game.n),game.n);s.push(`<circle cx="${number(x)}" cy="${number(y)}" r="9" fill="none" stroke="${ink}" stroke-width="1"/>`);}s.push('</g>');}
 s.push('</g>');
 const chartX=180,chartY=1200,chartW=1040,chartH=54;
 s.push(`<path d="M${chartX},${chartY}H${chartX+chartW}" stroke="#d4d1c8"/><g font-family="Arial,sans-serif" font-size="10" fill="#747b70" letter-spacing="1"><text x="60" y="1115">RESISTANCE / TIME</text><text x="1340" y="1115" text-anchor="end">${mode==='strata'?'ALL RECORDED LAYERS':'SINGLE POSITION'} · NO ADDED MOVES</text></g>`);
 if(fields.length){const logs=fields.filter(Boolean).flatMap(pair=>pair.map(f=>Math.log(f.resistance))),lo=Math.min(...logs),hi=Math.max(...logs),range=Math.max(hi-lo,.1);
  for(let c=0;c<2;c++){const points=[];for(let t=0;t<=step;t++)if(fields[t])points.push([chartX+chartW*t/Math.max(1,game.moves.length),chartY-chartH*(Math.log(fields[t][c].resistance)-lo)/range]);s.push(`<path d="${smooth(points)}" fill="none" stroke="${c?rust:ink}" stroke-width="1.2" opacity=".6"/>`);}
  for(let t=1;t<=game.moves.length;t++){const x=chartX+chartW*t/game.moves.length;s.push(`<path d="M${number(x)},1211v${t===step?12:3}" stroke="${t===step?ink:'#aaa99c'}" opacity=".55"/>`);}
 }
 s.push(`<g font-family="Arial,sans-serif" font-size="11" letter-spacing="1.2" fill="#6c7067"><text x="60" y="1250">${esc(meta.collectionLabel||'HALIFAX HEX CLUB')} · ${game.placements} PLACEMENTS · ${game.swaps} SWAP</text><text x="1340" y="1250" text-anchor="end">POTENTIAL IS NOT A PROVEN CONNECTION</text></g></svg>`);
 return s.join('');
}
root.HexArt={buildSVG,prepareFrame,contours,position};if(typeof module!=='undefined')module.exports=root.HexArt;
})(typeof globalThis!=='undefined'?globalThis:this);
