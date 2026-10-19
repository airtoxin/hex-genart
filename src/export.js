/* Export the unchanged field and record summary, without the surrounding poster. */
(function(root){
'use strict';
const NS='http://www.w3.org/2000/svg',PAD=24;
// Bounds of the shared rhombus in root coordinates, including translate(105,0).
const BOARD={left:145,top:250,right:1180,bottom:1030,upperLeft:390};
function layout(poster){
 const summary=poster.querySelector('[data-export="summary"]');
 if(!summary||!poster.querySelector('[data-export="art"]'))throw new Error('Export sections are missing');
 const box=summary.getBBox(),right=BOARD.right,left=right-box.width;
 // Fit the existing right-aligned summary into the white space above the sloping top bank.
 // Wider summaries move upward so they never cover the field.
 const topBank=BOARD.top+130*Math.max(0,Math.min(1,(left-BOARD.upperLeft)/790));
 const bottom=Math.min(300,topBank-PAD),dx=right-(box.x+box.width),dy=bottom-(box.y+box.height);
 const x=Math.floor(Math.min(BOARD.left,left)-PAD),y=Math.floor(Math.min(BOARD.top,bottom-box.height)-PAD);
 const width=Math.ceil(BOARD.right+PAD)-x,height=Math.ceil(BOARD.bottom+PAD)-y;
 return {x,y,width,height,summaryX:dx,summaryY:dy};
}
function prepare(poster){
 const box=layout(poster),svg=document.createElementNS(NS,'svg');
 svg.setAttribute('width',box.width);svg.setAttribute('height',box.height);
 svg.setAttribute('viewBox',[box.x,box.y,box.width,box.height].join(' '));
 svg.setAttribute('role','img');svg.setAttribute('aria-label',poster.getAttribute('aria-label')||'Hex art');
 for(const node of poster.children)if(['title','desc','defs'].includes(node.localName))svg.append(node.cloneNode(true));
 const background=document.createElementNS(NS,'rect');
 for(const key of ['x','y','width','height'])background.setAttribute(key,box[key]);
 background.setAttribute('fill',poster.querySelector(':scope > rect')?.getAttribute('fill')||'#f3f0e8');
 svg.append(background,poster.querySelector('[data-export="art"]').cloneNode(true));
 const summary=poster.querySelector('[data-export="summary"]').cloneNode(true);
 summary.setAttribute('transform','translate('+box.summaryX+','+box.summaryY+')');svg.append(summary);
 return svg;
}
function serialize(poster){return new XMLSerializer().serializeToString(prepare(poster));}
root.HexExport={layout,prepare,serialize};
})(globalThis);
