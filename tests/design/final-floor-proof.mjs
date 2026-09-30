// Native browser proof, synthetic local records only; no provider calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:4433';
const out = resolve('data/reviews/app-polish-2026-09-29');
const session = `dogfood-floor-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session',session,'--profile','Default',...args],{encoding:'utf8',timeout:60_000});
const evaluate = code => JSON.parse(browser('eval',`(async()=>{${code}})()`));
function open(project,view,page='') { browser('open',`${base}/?project=${project}&view=${view}&page=${page}`);browser('wait','h1');browser('wait','250'); }
const surfaces = [['navigation','tidepool','overview'],['overview','tidepool','overview'],['vision','dogfood-preview','vision'],['guide','dogfood-preview','guide'],['features','tidepool','features'],['competitors','tidepool','competitors'],['report','tidepool','report','home'],['answers','tidepool','design','book'],['screens','tidepool','screens','classes'],['suggestions','tidepool','suggestions'],['onboarding','tidepool','add-project'],['plan','dogfood-preview','plan']];
try {
  browser('set','viewport','640','844','2');browser('set','media','light','reduced-motion');
  for (const [surface,project,view,page] of surfaces) {
    open(project,view,page);browser('press','Tab');
    const facts=evaluate(`return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dpr:devicePixelRatio,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,focus:document.activeElement.outerHTML,outline:getComputedStyle(document.activeElement).outline};`);
    assert.equal(facts.width,facts.scrollWidth);assert.equal(facts.dpr,2);assert.equal(facts.reducedMotion,true);assert.match(facts.outline,/3px/);
    const dir=join(out,surface);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'retina-reduced-motion.json'),JSON.stringify(facts,null,2));browser('screenshot',join(dir,'retina-reduced-motion.png'));
  }
  for(const [viewport,width,height] of [['default',1280,900],['minimum',390,844]]) {
    browser('set','viewport',String(width),String(height),'1');open('tidepool','report','home');
    for (const id of ['design','purpose','ease','safety','speed','works']) {
      browser('focus',`[data-answer-row="${id}"]`);browser('press','Enter');browser('wait','100');assert.equal(evaluate('return document.querySelector("[data-answer-detail]").dataset.answerDetail;'),id);
      browser('focus','[data-action="back-to-report"]');browser('press','Enter');browser('wait','100');assert.equal(evaluate('return document.activeElement.dataset.answerRow;'),id);
    }
    writeFileSync(join(out,'report',`all-six-keyboard-${viewport}.json`),JSON.stringify({openedAllSix:true,returnedFocusAllSix:true}));
    open('tidepool','screens','classes');
    evaluate(`const {state}=await import('/js/state.mjs');state.history.error='Synthetic history request failure';state.history.loading=false;const {render}=await import('/js/app.mjs');render();return true;`);
    browser('screenshot',join(out,'screens',`retry-before-${viewport}.png`));browser('focus','[data-action="retry-history"]');browser('press','Enter');browser('wait','300');
    assert.equal(evaluate('return document.querySelector(".history-error")===null;'),true);
    assert.equal(evaluate('return document.activeElement.id==="answer-heading" || document.activeElement.dataset.action==="history-day";'),true);
    browser('screenshot',join(out,'screens',`retry-after-${viewport}.png`));
    writeFileSync(join(out,'screens',`retry-${viewport}.json`),JSON.stringify({initialFailure:'synthetic',retry:'actual successful history API read'}));
    open('tidepool','add-project');browser('fill','#product-url','invalid');browser('focus','#add-project-form button[type="submit"]');browser('press','Enter');browser('wait','200');
    assert.equal(evaluate('return document.activeElement.id;'),'product-url');assert.equal(evaluate('return document.querySelector("#product-url").getAttribute("aria-invalid");'),'true');
    writeFileSync(join(out,'onboarding',`keyboard-validation-${viewport}.json`),JSON.stringify({nativeEnterRefusesInvalidUrl:true,focus:'product-url'}));
  }
  console.log('12 current retina/reduced-motion surfaces, six answer keyboard paths, history retry and native form validation pass.');
} finally {browser('close');}
