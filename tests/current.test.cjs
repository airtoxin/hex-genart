'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
fs.mkdirSync(require('node:path').join(__dirname,'../outputs'),{recursive:true});
const C=require('../src/core.js'),F=require('../src/current.js'),games=fs.existsSync(path.join(__dirname,'../data/games.js'))?require('../data/games.js'):[];
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
function channel(n,columns,emptyAt=[]){const b=Array(n*n).fill(2);for(const x of columns)for(let y=0;y<n;y++)b[y*n+x]=emptyAt.includes(y*n+x)?0:1;return b;}
function checkFlow(f,b,n,c){
 assert(f.residual<1e-7);assert(f.balanceError<1e-7);assert(f.decompositionError<1e-7);near(f.energy,f.conductance);
 assert.equal(f.actual,C.connected(b,n,c));assert(Number.isFinite(f.conductance));assert(f.conductance>=0);
 for(const v of f.v)if(v!==null)assert(v>=-1e-8&&v<=1+1e-8);
 const represented=new Map();for(const r of f.routes){assert(r.current>0);assert.equal(c===1?Math.floor(r.nodes[0]/n):r.nodes[0]%n,0);assert.equal(c===1?Math.floor(r.nodes.at(-1)/n):r.nodes.at(-1)%n,n-1);
  for(let k=0;k<r.nodes.length;k++){const i=r.nodes[k];assert.notEqual(b[i],3-c);if(k){const j=r.nodes[k-1];assert(C.neighbors(j,n).includes(i));assert(f.v[j]>f.v[i]);const key=j+':'+i;represented.set(key,(represented.get(key)||0)+r.current);}}
 }
 for(const e of f.edges)near(represented.get(e.from+':'+e.to)||0,e.current,1e-7);
}
test('single finite stone chain: series law, current conservation, actual connection',()=>{const b=channel(5,[2]),f=F.solve(b,5,1);near(f.conductance,1/(5*.04));assert(f.actual);checkFlow(f,b,5,1);});
test('two independent chains double total conductance and divide current equally',()=>{const b=channel(5,[1,3]),f=F.solve(b,5,1);near(f.conductance,10);near(f.routes[0].current,f.routes[1].current);assert.equal(f.routes.length,2);checkFlow(f,b,5,1);});
test('empty bridge conducts potential flow without a stone connection',()=>{const b=channel(5,[2],[12]),f=F.solve(b,5,1);near(f.conductance,1/(1+4*.04));assert(!f.actual);assert(f.potentialConnected);checkFlow(f,b,5,1);});
test('opponent barrier blocks exactly; disconnected and floating components carry zero flow',()=>{const b=Array(25).fill(0);for(let x=0;x<5;x++)b[10+x]=2;const f=F.solve(b,5,1);assert.equal(f.conductance,0);assert.equal(f.routes.length,0);assert(!f.potentialConnected);const w=F.solve(b,5,2);assert(w.actual);checkFlow(w,b,5,2);const island=Array(25).fill(2);island[12]=0;const isolated=F.solve(island,5,1);assert.equal(isolated.v[12],null);assert.equal(isolated.conductance,0);});
test('empty board is symmetric; all-own finite network conducts 25 times as much',()=>{const b=Array(25).fill(0),f=F.solve(b,5,1),w=F.solve(b,5,2);near(f.conductance,w.conductance);near(F.solve(Array(25).fill(1),5,1).conductance,25*f.conductance);near(F.reference(5),f.conductance);checkFlow(f,b,5,1);});
test('own stones improve and opponent removal reduces conductance on same network',()=>{const b=Array(25).fill(0),initial=F.solve(b,5,1).conductance;b[12]=1;assert(F.solve(b,5,1).conductance>initial);b[12]=2;assert(F.solve(b,5,1).conductance<initial);});
test('all eight games: every current solves, avoids opponent cells and decomposes its edges',{skip:!games.length},()=>{
 let frames=0,maxResidual=0,maxDecompositionError=0;const rows=[];
 for(const meta of games){const g=C.readGame(meta.sgf),ref=F.reference(g.n);let final;
  for(const frame of g.frames){final=F.prepareFrame(frame,g.n);for(let c=1;c<=2;c++){checkFlow(final[c-1],frame.board,g.n,c);maxResidual=Math.max(maxResidual,final[c-1].residual);maxDecompositionError=Math.max(maxDecompositionError,final[c-1].decompositionError);}frames++;}
  if(g.actual.black){assert.equal(final[1].conductance,0);assert(final[0].conductance>0);}rows.push({file:meta.file,frames:g.frames.length,reference:ref,final:final.map(f=>({conductance:f.conductance,relative:f.conductance/ref,actual:f.actual,potentialConnected:f.potentialConnected,routes:f.routes.length}))});
 }
 fs.writeFileSync(path.join(__dirname,'../outputs/current-validation.json'),JSON.stringify({frames,solves:frames*2,maxResidual,maxDecompositionError,games:rows},null,2));console.log({frames,solves:frames*2,maxResidual,maxDecompositionError});
});