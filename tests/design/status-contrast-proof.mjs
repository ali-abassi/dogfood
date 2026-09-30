// Measure graphic status marks that axe leaves incomplete because they contain symbols only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const session = `dogfood-contrast-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser',['--session',session,'--profile','Default',...args],{encoding:'utf8',timeout:60_000});
const rgb = value => value.match(/[\d.]+/g).map(Number);
function blend(front, back) { const alpha=front[3]??1;return front.slice(0,3).map((value,n)=>value*alpha+back[n]*(1-alpha)); }
function luminance(color) { return color.map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4).reduce((sum,x,n)=>sum+x*[0.2126,0.7152,0.0722][n],0); }
function contrast(mark) {
  const background=mark.backgrounds.reverse().reduce((back,front)=>blend(rgb(front),back),[255,255,255]);
  const a=luminance(blend(rgb(mark.color),background)),b=luminance(background);
  return {...mark,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
}
try {
  for(const [surface,view,page] of [['answers','design','book'],['screens','screens','classes']]) {
    const records=[];
    for(const [viewport,width,height] of [['default',1280,900],['minimum',390,844]]) {
      browser('set','viewport',String(width),String(height));
      for(const theme of ['light','dark']) {
        browser('set','media',theme);browser('open',`http://127.0.0.1:4433/?project=tidepool&view=${view}&page=${page}`);browser('wait','h1');browser('wait','250');
        const marks=JSON.parse(browser('eval',`[...document.querySelectorAll('[role="img"]')].filter(x=>x.getBoundingClientRect().width).map(x=>{const backgrounds=[];for(let n=x;n;n=n.parentElement)backgrounds.push(getComputedStyle(n).backgroundColor);return {label:x.getAttribute('aria-label'),color:getComputedStyle(x).color,backgrounds};})`)).map(contrast);
        assert.ok(marks.every(mark=>mark.ratio>=3),JSON.stringify(marks));records.push({viewport,theme,graphicThreshold:3,marks});
      }
    }
    assert.ok(records.some(record=>record.marks.length>0));
    writeFileSync(join('data/reviews/app-polish-2026-09-29',surface,'status-contrast.json'),JSON.stringify(records,null,2));
  }
  console.log('Visible status graphics meet 3:1 in both themes and both viewports; text/control contrast uses the zero-violation axe reports.');
} finally {browser('close');}
