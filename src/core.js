/* SGF + Hex + resistor field, dependency-free; shared by browser and Node tests. */
(function(root){
'use strict';
function parseSGF(text){
 let i=0; text=text.replace(/^\uFEFF/,'');
 const ws=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
 const fail=m=>{throw new Error(m+' at SGF offset '+i);};
 function value(){
  if(text[i++]!=='[')fail('Expected ['); let s='';
  while(i<text.length){let c=text[i++];if(c===']')return s;
   if(c==='\\'){c=text[i++];if(c==='\r'){if(text[i]==='\n')i++;continue;}if(c==='\n')continue;if(c===undefined)fail('Unclosed escape');}
   s+=c;
  } fail('Unclosed value');
 }
 function node(){i++;const p={};ws();while(/[A-Za-z]/.test(text[i]||'')&&i<text.length){let k='';while(/[A-Za-z]/.test(text[i]||'')&&i<text.length)k+=text[i++];k=k.toUpperCase();ws();let a=[];while(text[i]==='['){a.push(value());ws();}if(!a.length)fail('Property without value');if(p[k])fail('Duplicate property '+k);p[k]=a;}return p;}
 function tree(){if(text[i++]!=='(')fail('Expected (');ws();let sequence=[],children=[];while(text[i]===';'){sequence.push(node());ws();}if(!sequence.length)fail('Empty game tree');while(text[i]==='('){children.push(tree());ws();}if(text[i++]!==')')fail('Expected )');return {sequence,children};}
 const games=[];ws();while(i<text.length){games.push(tree());ws();}if(!games.length)fail('Empty SGF');return games;
}
function mainline(tree){return tree.sequence.concat(tree.children.length?mainline(tree.children[0]):[]);}
function branchCount(tree){return Math.max(0,tree.children.length-1)+tree.children.reduce((a,c)=>a+branchCount(c),0);}
function point(s,n){const m=/^([a-z]+)([1-9]\d*)$/i.exec(s.trim());if(!m)throw new Error('Unsupported coordinate '+s);let x=0;for(const c of m[1].toLowerCase())x=x*26+c.charCodeAt(0)-96;x--;const y=+m[2]-1;if(x<0||x>=n||y<0||y>=n)throw new Error('Out-of-board '+s);return y*n+x;}
function neighbors(i,n){const x=i%n,y=Math.floor(i/n),out=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]){const X=x+dx,Y=y+dy;if(X>=0&&X<n&&Y>=0&&Y<n)out.push(Y*n+X);}return out;}
function connected(board,n,color){const queue=[],seen=new Set();for(let k=0;k<n;k++){const i=color===1?k:k*n;if(board[i]===color){queue.push(i);seen.add(i);}}for(let q=0;q<queue.length;q++){const i=queue[q];if(color===1?Math.floor(i/n)===n-1:i%n===n-1)return true;for(const j of neighbors(i,n))if(board[j]===color&&!seen.has(j)){seen.add(j);queue.push(j);}}return false;}
function readGame(sgf){
 const trees=parseSGF(sgf);if(trees.length!==1)throw new Error('Expected exactly one game');const tree=trees[0],nodes=mainline(tree),r=nodes[0];
 if(r.GM?.[0]!=='11')throw new Error('Not Hex GM[11]');
 const size=r.SZ?.[0]||'11';if(!/^\d+$/.test(size))throw new Error('Only square boards supported');const n=+size;if(n<2||n>30)throw new Error('Unsupported board size');
 let board=new Int8Array(n*n),next=r.PL?.[0]==='W'?2:1,ended=false,placements=0,swaps=0,stopReason='end-of-mainline',commentCount=0;
 const moves=[],frames=[];const ip=nodes.findIndex(p=>p.IP);const end=ip>=0?ip:nodes.length-1;
 for(let ni=0;ni<=end;ni++){
  const p=nodes[ni];if(p.C)commentCount++;
  for(const key of ['AB','AW','AE'])if(p[key]){if(ni!==0)throw new Error('Mid-game setup node in main line');for(const s of p[key])board[point(s,n)]=key==='AB'?1:key==='AW'?2:0;}
  if(!frames.length)frames.push({board:Array.from(board),move:null,comment:(p.C||[]).join('\n')});
  const keys=['B','W'].filter(k=>p[k]);if(keys.length>1)throw new Error('Two moves in node');if(!keys.length)continue;
  if(ended)break;const key=keys[0],color=key==='B'?1:2,raw=p[key][0].trim().toLowerCase();if(color!==next&&!['resign','forfeit'].includes(raw))throw new Error('Wrong turn at '+(moves.length+1)+': '+key+'['+raw+']');
  const move={color,raw,type:'place',comment:(p.C||[]).join('\n'),node:ni};
  if(raw==='swap-pieces'||raw==='swap-sides'){
   if(moves.length!==1||color!==2)throw new Error('Swap outside standard pie-rule move 2');
   move.type=raw;swaps++;
   if(raw==='swap-pieces'){const b=new Int8Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++)b[x*n+y]=board[y*n+x]?3-board[y*n+x]:0;board=b;next=1;}else next=2;
  }else if(raw==='resign'||raw==='forfeit'){move.type=raw;ended=true;stopReason=raw;move.winner=3-color;
  }else if(raw==='pass'||raw===''){throw new Error('Pass is not supported as a legal Hex game move');
  }else{const pos=point(raw,n);if(board[pos])throw new Error('Occupied cell at '+raw);if(connected(board,n,1)||connected(board,n,2))throw new Error('Move after completed connection');board[pos]=color;move.pos=pos;placements++;next=3-color;}
  moves.push(move);frames.push({board:Array.from(board),move,comment:move.comment});
 }
 if(!ended&&ip>=0)stopReason='IP';
 const result=r.RE?.[0]||null,last=moves.at(-1),actual={black:connected(board,n,1),white:connected(board,n,2)};
 return {n,moves,frames,placements,swaps,result,stopReason,commentCount,variations:branchCount(tree),mainlineNodes:nodes.length,excludedTrailingNodes:nodes.length-(last?.node??0)-1,actual,root:r,sourceWinner:last?.winner??(result?.[0]==='B'?1:result?.[0]==='W'?2:null)};
}
function solvePotential(board,n,color){
 // Cell resistivity: own .04, empty 1, opponent 2000. Harmonic edge conductance.
 // Opponent leakage is regularization, never a claim of legal connectivity.
 const N=n*n,R=Float64Array.from(board,c=>c===color?.04:c===0?1:2000),diag=new Float64Array(N),rhs=new Float64Array(N),edges=[];
 for(let i=0;i<N;i++){
  for(const j of neighbors(i,n))if(j>i){const g=2/(R[i]+R[j]);edges.push([i,j,g]);diag[i]+=g;diag[j]+=g;}
  const axis=color===1?Math.floor(i/n):i%n;
  if(axis===0){const g=2/R[i];diag[i]+=g;rhs[i]+=g;}if(axis===n-1)diag[i]+=2/R[i];
 }
 function mul(v,out){for(let i=0;i<N;i++)out[i]=diag[i]*v[i];for(const [i,j,g]of edges){out[i]-=g*v[j];out[j]-=g*v[i];}}
 const v=Float64Array.from({length:N},(_,i)=>1-((color===1?Math.floor(i/n):i%n)+.5)/n),res=new Float64Array(N),z=new Float64Array(N),p=new Float64Array(N),ap=new Float64Array(N);mul(v,ap);
 let rz=0;for(let i=0;i<N;i++){res[i]=rhs[i]-ap[i];p[i]=z[i]=res[i]/diag[i];rz+=res[i]*z[i];}
 let iterations=0;
 for(;iterations<N*3&&rz>1e-20;iterations++){
  mul(p,ap);let den=0;for(let i=0;i<N;i++)den+=p[i]*ap[i];if(den<=0)break;const a=rz/den;let max=0;
  for(let i=0;i<N;i++){v[i]+=a*p[i];res[i]-=a*ap[i];max=Math.max(max,Math.abs(res[i]));}if(max<1e-9)break;
  let newer=0;for(let i=0;i<N;i++){z[i]=res[i]/diag[i];newer+=res[i]*z[i];}const beta=newer/rz;for(let i=0;i<N;i++)p[i]=z[i]+beta*p[i];rz=newer;
 }
 mul(v,ap);let residual=0,current=0;for(let i=0;i<N;i++){residual=Math.max(residual,Math.abs(ap[i]-rhs[i]));if((color===1?Math.floor(i/n):i%n)===0)current+=(2/R[i])*(1-v[i]);}
 return {v:Array.from(v),resistance:1/current,current,residual,iterations};
}
root.HexCore={parseSGF,mainline,branchCount,point,neighbors,connected,readGame,solvePotential};
if(typeof module!=='undefined')module.exports=root.HexCore;
})(typeof globalThis!=='undefined'?globalThis:this);
