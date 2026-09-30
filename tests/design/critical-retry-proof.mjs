// Real UI interactions with delayed local reads and one explicit synthetic save failure.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const session=`dogfood-retry-${process.pid}`;
const browser=(...args)=>execFileSync('agent-browser',['--session',session,'--profile','Default',...args],{encoding:'utf8',timeout:60_000});
const evaluate=code=>JSON.parse(browser('eval',`(async()=>{${code}})()`));
const out='data/reviews/app-polish-2026-09-29';
function open(project,view){browser('open',`http://127.0.0.1:4433/?project=${project}&view=${view}`);browser('wait','h1');browser('wait','250');}
function capture(surface,name,viewport){browser('screenshot',join(out,surface,`${name}-${viewport}.png`),'--full');}
try {
  for(const [viewport,width,height]of[['default',1280,900],['minimum',390,844]]) {
    browser('set','viewport',String(width),String(height));open('tidepool','suggestions');
    browser('uncheck','input[name="project-suggestion"]');
    const key=evaluate('return document.querySelector("input[name=project-suggestion]").dataset.choice;');
    evaluate(`window.retryFetch=window.fetch;window.fetch=async(...args)=>{await new Promise(done=>setTimeout(done,1200));return window.retryFetch(...args);};const {reloadProjectSuggestions}=await import('/js/views/suggestions.mjs');void reloadProjectSuggestions();return true;`);
    assert.equal(evaluate('return document.querySelector("input[name=project-suggestion]").checked;'),false);assert.match(evaluate('return document.body.innerText;'),/Checking for new suggestions/);capture('suggestions','choice-pending',viewport);
    browser('wait','1500');assert.equal(evaluate(`return [...document.querySelectorAll('input[name=project-suggestion]')].find(box=>box.dataset.choice===${JSON.stringify(key)}).checked;`),false);capture('suggestions','choice-refreshed',viewport);
    writeFileSync(join(out,'suggestions',`choice-retention-${viewport}.json`),JSON.stringify({uncheckedContentKey:key,retainedWhilePending:true,retainedAfterActualApiRead:true}));
    open('tidepool','add-project');browser('focus','.form-actions [data-action="cancel-add-project"]');browser('press','Enter');browser('wait','200');assert.equal(evaluate(`return !!document.querySelector('section[aria-label="Project overview"]');`),true);capture('onboarding','cancel-return',viewport);
    writeFileSync(join(out,'onboarding',`cancel-return-${viewport}.json`),JSON.stringify({nativeEnterCancel:true,returnedToOverview:true}));
    open('dogfood-preview','plan');browser('click','[data-action="add-task"]');browser('fill','#task-title','Synthetic save feedback fixture');browser('fill','#task-outcome','The entered task remains available after a simulated save failure.');browser('fill','#task-checks','["node","--version"]');
    evaluate(`window.fetch=async()=>{await new Promise(done=>setTimeout(done,1200));return new Response(JSON.stringify({error:'Synthetic task save failure. Retry with the same draft.'}),{status:503,headers:{'Content-Type':'application/json'}});};return true;`);
    browser('focus','#task-form button[type=submit]');browser('press','Enter');browser('wait','100');assert.equal(evaluate('return document.querySelector("#task-form button[type=submit]").textContent;'),'Saving…');assert.equal(evaluate('return document.querySelector("#task-form button[type=submit]").disabled;'),true);capture('plan','save-pending',viewport);
    browser('wait','1500');assert.equal(evaluate('return document.querySelector("#task-title").value;'),'Synthetic save feedback fixture');assert.match(evaluate('return document.querySelector("#task-form-error").textContent;'),/Synthetic task save failure/);assert.equal(evaluate('return document.querySelector("#task-form-error").hidden;'),false);assert.equal(evaluate('return document.querySelector("#task-form button[type=submit]").disabled;'),false);capture('plan','save-failure',viewport);
    writeFileSync(join(out,'plan',`save-feedback-${viewport}.json`),JSON.stringify({syntheticApiFailure:true,pendingLabel:'Saving…',disabledWhileSaving:true,errorVisible:true,draftRetained:true,retryEnabled:true}));
  }
  console.log('Unchecked choice survives actual refresh; Cancel returns to Overview; task save feedback and failed-save draft retention pass at both widths.');
}finally{browser('close');}
