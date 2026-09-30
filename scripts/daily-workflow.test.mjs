import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
const data = mkdtempSync(join(tmpdir(),'dogfood-daily-29-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { pagesGate } = await import('../lib/completion.mjs');
const demo = JSON.parse(readFileSync('demo/projects/tidepool.json','utf8')).pages.find(page=>page.id==='home');
const fixtureFacts = { loadMs:300,consoleErrors:[],pageErrors:[],failedRequests:[],requests:[],horizontalOverflow:false,links:[],seo:{title:'Synthetic page',description:'Synthetic page for a deterministic workflow proof.',robots:'noindex',canonical:null,lang:'en',h1:'Synthetic page',h1Count:1},accessibility:{imagesWithoutAlt:0,unlabeledFields:0,unnamedButtons:0},headers:{} };
after(()=>rmSync(data,{recursive:true,force:true}));
function scan(id, facts=fixtureFacts) {
  store.recordScan('daily',id,{sourceUrl:`http://127.0.0.1:4322/app/${id}?mode=qa#exact`,environment:'mock',actor:'Synthetic workflow fixture',tier:'mock',...Object.fromEntries(['desktop','mobile'].map(device=>[device,{file:resolve('demo',demo.captures[device].path.replace(/^\//,'')),viewport:demo.captures[device].viewport,facts}]))});
}
function page(id) { return store.pageById(store.readProject('daily'),id); }
function review(id) {
  const note='Synthetic native test assertion, not provider or production evidence.';
  store.recordVerdicts('daily',id,{checks:Object.fromEntries(['design','purpose','ease'].map(key=>[key,{status:'pass',note}])),features:[{id:'local',status:'pass',note},{id:'provider',status:'awaiting_live',note:'Only the deployed paid provider can prove the real output; no paid call is authorized.'}],audit:Object.fromEntries(Object.entries(page(id).audit).map(([key,rows])=>[key,rows.map(row=>({id:row.id,status:'pass',note}))]))},'agent:test');
}
function view() { return store.projectView(store.readProject('daily')); }
function cli(args,input) { return spawnSync(process.execPath,['bin/dogfood.mjs',...args,'--project','daily'],{env:{...process.env,DOGFOOD_DATA:data},input:input===undefined?undefined:JSON.stringify(input),encoding:'utf8'}); }

test('29-page unchanged rescan retains audit evidence and compact release gate with visible debt',()=>{
  store.createProject({id:'daily',name:'29-page synthetic daily workflow',url:'http://127.0.0.1:4322'});
  for(let n=1;n<=29;n++) {
    const id=`page-${n}`;
    store.registerPage('daily',{id,name:`Page ${n}`,group:'Fixture',route:`/app/${id}?mode=qa#exact`,features:[{id:'local',name:'Local behavior'},{id:'provider',name:'Live provider behavior',requiresLive:true}]});
    scan(id); review(id);
  }
  assert.equal(pagesGate(view().pages,'acceptance').complete,true);
  const original=page('page-1').audit.seo[0].at;
  for(let n=1;n<=29;n++)scan(`page-${n}`);
  const gate=pagesGate(view().pages,'acceptance');
  assert.equal(gate.complete,true);
  assert.equal(gate.lines.length,29);
  assert.ok(gate.lines.every(line=>line.includes('stale: 0, live debt: 1')));
  assert.equal(page('page-1').audit.seo[0].at,original);
  assert.ok(page('page-1').audit.seo[0].carriedFrom);
  const output=cli(['gate','--accept']);
  assert.equal(output.status,0,output.stderr);
  assert.equal(output.stdout.trim().split('\n').length,29);
});

test('one changed fact stales its dependent question; measured CLI records facts without replacing human review',()=>{
  const changed=structuredClone(fixtureFacts);changed.accessibility.imagesWithoutAlt=1;
  scan('page-7',changed);
  const current=view().pages.find(page=>page.id==='page-7');
  assert.equal(current.progress.staleCount,1);
  assert.equal(pagesGate(view().pages,'acceptance').complete,false);
  const result=cli(['accept-measured','page-7','--agent','codex','--json']);
  assert.equal(result.status,0,result.stderr);
  const saved=page('page-7').audit.accessibility.find(row=>row.id==='measured-alt');
  assert.equal(saved.status,'needs_work');assert.equal(saved.verifiedBy,'scan');assert.equal(saved.by,'agent:codex');
  assert.equal(page('page-7').audit.accessibility.find(row=>row.id==='names').at,current.audit.accessibility.find(row=>row.id==='names').at);
  const concise=cli(['gate','page-7','--accept']);const verbose=cli(['gate','page-7','--accept','--verbose']);
  assert.equal(concise.status,1);assert.equal(verbose.status,1);assert.equal(concise.stdout.trim().split('\n').length,1);assert.ok(verbose.stdout.trim().split('\n').length>1);
});

test('deployment CLI creates pending debt, preserves local URL and does not claim a provider passed',()=>{
  const result=cli(['deployed','--url','https://live-fixture.example','--revision','reported-test-revision','--agent','codex','--json']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).liveDebt.length,29);
  assert.equal(store.readProject('daily').source.url,'http://127.0.0.1:4322');
  assert.equal(page('page-1').features[1].status,'untested');assert.equal(page('page-1').features[1].liveDebt.state,'pending');
  assert.equal(pagesGate(view().pages,'acceptance').complete,false);
});
