/* Exact opponent blocking; finite own resistance; unit voltage on the two banks. */
(function(root){
'use strict';
const C=root.HexCore||(typeof require==='function'?require('./core.js'):null),emptyCache=new Map();
function solve(board,n,color){
 const N=n*n,open=board.map(c=>c!==3-color),seen=new Uint8Array(N),active=new Uint8Array(N),v=Array(N).fill(null);
 const axis=i=>color===1?Math.floor(i/n):i%n;
 // Solve only components that touch both electrodes. One-bank and floating components carry no through-current.
 for(let seed=0;seed<N;seed++)if(open[seed]&&!seen[seed]){
  const component=[seed];seen[seed]=1;let source=false,sink=false;
  for(let k=0;k<component.length;k++){const i=component[k];source ||= axis(i)===0;sink ||= axis(i)===n-1;for(const j of C.neighbors(i,n))if(open[j]&&!seen[j]){seen[j]=1;component.push(j);}}
  for(const i of component){if(source&&sink)active[i]=1;else v[i]=source?1:sink?0:null;}
 }
 const cells=[];for(let i=0;i<N;i++)if(active[i])cells.push(i);
 const actual=C.connected(board,n,color);
 if(!cells.length)return {v,edges:[],sources:[],sinks:[],conductance:0,current:0,residual:0,balanceError:0,energy:0,actual,potentialConnected:false,routes:[],decompositionError:0};
 const R=board.map(c=>c===color?.04:1),diag=new Float64Array(N),rhs=new Float64Array(N),links=[],sources=[],sinks=[];
 for(const i of cells){for(const j of C.neighbors(i,n))if(active[j]&&j>i){const g=2/(R[i]+R[j]);links.push({a:i,b:j,g});diag[i]+=g;diag[j]+=g;}
  if(axis(i)===0){const g=2/R[i];sources.push({node:i,g});diag[i]+=g;rhs[i]+=g;}
  if(axis(i)===n-1){const g=2/R[i];sinks.push({node:i,g});diag[i]+=g;}
 }
 const x=new Float64Array(N),r=new Float64Array(N),p=new Float64Array(N),ap=new Float64Array(N);
 function mul(a,out){out.fill(0);for(const i of cells)out[i]=diag[i]*a[i];for(const e of links){out[e.a]-=e.g*a[e.b];out[e.b]-=e.g*a[e.a];}}
 for(const i of cells)x[i]=1-(axis(i)+.5)/n;mul(x,ap);let rz=0;
 for(const i of cells){r[i]=rhs[i]-ap[i];p[i]=r[i]/diag[i];rz+=r[i]*p[i];}
 for(let iteration=0;iteration<N*5&&rz>1e-24;iteration++){
  mul(p,ap);let den=0;for(const i of cells)den+=p[i]*ap[i];if(den<=0)break;const a=rz/den;let residual=0;
  for(const i of cells){x[i]+=a*p[i];r[i]-=a*ap[i];residual=Math.max(residual,Math.abs(r[i]));}if(residual<1e-11)break;
  let next=0;for(const i of cells)next+=r[i]*r[i]/diag[i];const beta=next/rz;for(const i of cells)p[i]=r[i]/diag[i]+beta*p[i];rz=next;
 }
 mul(x,ap);let residual=0,energy=0;for(const i of cells){v[i]=x[i];residual=Math.max(residual,Math.abs(ap[i]-rhs[i]));}
 const edges=links.map(e=>{const signed=e.g*(v[e.a]-v[e.b]);energy+=signed*signed/e.g;return {...e,signed,current:Math.abs(signed),from:signed>=0?e.a:e.b,to:signed>=0?e.b:e.a};});
 let current=0,out=0;for(const e of sources){e.current=Math.max(0,e.g*(1-v[e.node]));current+=e.current;energy+=e.current*e.current/e.g;}
 for(const e of sinks){e.current=Math.max(0,e.g*v[e.node]);out+=e.current;energy+=e.current*e.current/e.g;}
 const flow={v,edges,sources,sinks,current,conductance:current,residual,balanceError:Math.abs(current-out),energy,actual,potentialConnected:true};
 const decomposition=decompose(flow,n);return {...flow,...decomposition};
}
function decompose(flow,n){
 const source=n*n,sink=source+1,out=Array.from({length:sink+1},()=>[]),eps=Math.max(1e-10,flow.current*1e-10),arcs=[];
 function add(from,to,amount){if(amount>eps){const a={from,to,left:amount};out[from].push(a);arcs.push(a);}}
 for(const e of flow.sources)add(source,e.node,e.current);for(const e of flow.edges)add(e.from,e.to,e.current);for(const e of flow.sinks)add(e.node,sink,e.current);
 const routes=[];let routed=0;
 // Greedy residual decomposition on the strictly descending-potential DAG; not a unique strategic path.
 for(let k=0;k<arcs.length;k++){
  const used=[],nodes=[];let at=source,amount=Infinity;
  while(at!==sink){let best=null;for(const a of out[at])if(a.left>eps&&(!best||a.left>best.left))best=a;if(!best){amount=0;break;}used.push(best);amount=Math.min(amount,best.left);at=best.to;if(at!==sink)nodes.push(at);if(used.length>n*n+2)throw new Error('Flow cycle');}
  if(!(amount>eps))break;for(const a of used)a.left=Math.max(0,a.left-amount);routes.push({nodes,current:amount});routed+=amount;
 }
 routes.sort((a,b)=>b.current-a.current);return {routes,decompositionError:Math.abs(flow.current-routed)};
}
function reference(n){if(!emptyCache.has(n))emptyCache.set(n,solve(Array(n*n).fill(0),n,1).conductance);return emptyCache.get(n);}
function prepareFrame(frame,n,compact=false){return [1,2].map(c=>{const f=solve(frame.board,n,c);if(!compact)return f;const {v,edges,sources,sinks,...rest}=f;return {...rest,routes:f.routes.slice(0,120)};});}
root.HexFlow={solve,reference,prepareFrame};if(typeof module!=='undefined')module.exports=root.HexFlow;
})(typeof globalThis!=='undefined'?globalThis:this);