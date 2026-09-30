// Actual browser interactions on synthetic local evidence. Never calls a provider.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:4433';
const data = resolve(process.argv[3] || 'data/polish-fixture-final');
const out = resolve(process.argv[4] || 'data/reviews/app-polish-2026-09-29/daily-workflow');
mkdirSync(out, { recursive: true });
const session = `dogfood-daily-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session',session,'--profile','Default',...args], { encoding:'utf8',timeout:60_000 });
const evaluate = code => JSON.parse(browser('eval', `(async()=>{${code}})()`));
const click = selector => { browser('snapshot','-i'); browser('click',selector); browser('wait','200'); };
const fixture = action => execFileSync(process.execPath,['tests/design/daily-workflow-fixture.mjs',data,action],{encoding:'utf8'});
const project = process.env.DOGFOOD_UI_FIXTURE_PROJECT || 'daily-workflow-fixture';
const records = [];
function open(view) { browser('open',`${base}/?project=${project}&page=home&view=${view}`); browser('wait','h1'); browser('wait','250'); }
function capture(state, viewport) {
  browser('screenshot',join(out,`${state}-${viewport}.png`),'--full');
  const facts = evaluate(`return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelector('h1').textContent,text:document.querySelector('.page-workspace').innerText};`);
  assert.equal(facts.width,facts.scrollWidth);
  writeFileSync(join(out,`${state}-${viewport}.json`),JSON.stringify(facts,null,2));
  records.push({state,viewport,...facts});
}
function eachViewport(run) {
  for (const [name,width,height] of [['default',1280,900],['minimum',390,844]]) {
    browser('set','viewport',String(width),String(height)); run(name);
  }
}
try {
  eachViewport(viewport => { open('overview'); assert.match(evaluate('return document.body.innerText;'),/Live verification debt/); capture('awaiting-debt',viewport); open('report'); click('.measured-answers summary'); capture('measured-preview',viewport); });
  open('report'); click('[data-action="accept-measured"]');
  assert.match(evaluate('return document.querySelector(".save-message").textContent;'),/Measured answers saved/);
  eachViewport(viewport => { open('ease'); assert.match(evaluate('return document.body.innerText;'),/Verified by page check/); capture('accepted-measured',viewport); });
  fixture('rescan');
  eachViewport(viewport => { open('ease'); assert.match(evaluate('return document.body.innerText;'),/Carried from/); capture('carried',viewport); open('works'); click('[data-action="edit-things"]'); assert.ok(evaluate(`return [...document.querySelectorAll('#thing-provider-status option')].some(x=>x.value==='awaiting_live');`)); capture('awaiting-editor',viewport); });
  fixture('deployed');
  eachViewport(viewport => {
    open('works'); assert.match(evaluate('return document.body.innerText;'),/To do after deploy/); capture('pending-after-deploy',viewport);
    evaluate(`const {state}=await import('/js/state.mjs');const page=state.project.pages.find(page=>page.id==='home');page.qa.tests=[{id:'fixture-log',label:'Synthetic detailed saved check',file:'tests/fixture/very-long-source-path-that-must-remain-readable/example-check.mjs',reason:'Exercise readable historical evidence in the UI only.'}];state.qa.loading=false;state.qa.runs=[{status:'failed',finishedAt:new Date().toISOString(),passed:1,total:2,revision:'synthetic-revision',dirty:false,cases:[{file:'tests/fixture/example-check.mjs',status:'failed',name:'Synthetic long expected delivery receipt comparison',detail:'Synthetic fixture log: the expected output was not present; retain the complete request and response explanation. '.repeat(12)},{file:'tests/fixture/example-check.mjs',status:'passed',name:'Synthetic preview persists across reload',detail:'Saved-example fixture only.'}]}];const {render}=await import('/js/app.mjs');render();return true;`);
    assert.match(evaluate('return document.querySelector(".qa-section").innerText;'),/Synthetic fixture log/); capture('qa-log-long',viewport);
    click('[data-finding-action="new"]'); browser('fill','#finding-title','A valid synthetic bug title'); browser('fill','#finding-detail','short'); click('#finding-form button[type="submit"]');
    assert.equal(evaluate('return document.activeElement.id;'),'finding-detail');
    browser('fill','#finding-detail','This corrected fixture detail has at least twenty characters.'); browser('fill','#finding-title','short'); click('#finding-form button[type="submit"]');
    assert.equal(evaluate('return document.activeElement.id;'),'finding-title');
    assert.equal(evaluate('return document.querySelector("#finding-detail").hasAttribute("aria-invalid");'),false); capture('bug-validation',viewport);
    browser('fill','#finding-title','A valid synthetic bug title');
    evaluate(`window.fixtureFetch=window.fetch;window.fetch=async()=>({ok:false,json:async()=>({error:'Synthetic save failure. Retry without losing the draft.'})});return true;`);
    click('#finding-form button[type="submit"]');
    assert.equal(evaluate('return document.querySelector("#finding-error").nextElementSibling.className;'),'form-actions');
    assert.equal(evaluate('return document.querySelectorAll("#finding-form [aria-invalid]").length;'),0); capture('bug-save-failure',viewport);
    evaluate('window.fetch=window.fixtureFetch;return true;');
    open('design'); click('[data-action="edit-answer"]'); browser('fill','#answer-note','short'); click('#answer-form button[type="submit"]'); assert.equal(evaluate('return document.activeElement.id;'),'answer-note'); assert.equal(evaluate('return document.querySelector("#answer-note").value;'),'short'); capture('answer-validation',viewport);
  });
  writeFileSync(join(out,'proof.json'),JSON.stringify({fixtureOnly:true,noProviders:true,records,result:'pass'},null,2));
  console.log(`${records.length} actual workflow states pass at 1280 and 390.`);
} finally { browser('close'); }
