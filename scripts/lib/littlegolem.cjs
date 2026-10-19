'use strict';
// LittleGolem's legacy export labels moves oppositely to its PB/PW metadata.
// Grounded against every move in the official game's rendered move list.
const assert=require('node:assert/strict'),C=require('../../src/core.js');
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\]/g,'\\]');
function makeSGF(n,moves,metadata={}){return '(;GM[11]FF[4]SZ['+n+']'+Object.entries(metadata).map(([k,v])=>k+'['+esc(v)+']').join('')+moves.map(m=>';'+m.color+'['+m.value+']').join('')+')';}
function decodeLG(s){
 const trees=C.parseSGF(s);assert.equal(trees.length,1);const nodes=C.mainline(trees[0]),r=nodes[0];
 assert.equal(C.branchCount(trees[0]),0,'Unexpected LG variation');assert(nodes[1]?.W,'LG first move should be W');
 const moves=nodes.slice(1).map(p=>{
  const keys=['W','B'].filter(k=>p[k]);assert.equal(keys.length,1);const sourceColor=keys[0];let v=p[sourceColor][0];
  if(/^[a-z]{2}$/.test(v))v=v[0]+(v.charCodeAt(1)-96);else if(v==='swap')v='swap-pieces';else assert(['resign','forfeit'].includes(v),'Unknown LG move '+v);
  return {color:sourceColor==='W'?'B':'W',value:v,sourceColor,sourceValue:p[sourceColor][0]};
 });
 // PB/PW/RE deliberately stay as published: only the move keys are reversed.
 const sgf=makeSGF(+r.SZ[0],moves,{PB:r.PB[0],PW:r.PW[0],RE:r.RE[0],EV:r.EV[0],SO:r.SO[0],GC:r.GC[0],AP:'HexStrataResearch:LG-adapter-1'});
 return {r,moves,sgf,g:C.readGame(sgf)};
}
module.exports={makeSGF,decodeLG};
