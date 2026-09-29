import assert from 'node:assert/strict';
import test from 'node:test';
import { pageHeaderMarkup } from '../public/js/views/page.mjs';
import { state } from '../public/js/state.mjs';

state.project = { id: 'fixture' };

function fixture(progress) {
  return { id: 'home', name: 'Home', route: '/', scan: null, captures: { desktop: { sourceUrl: null } }, progress: { status: 'pass', requirements: [], ...progress } };
}

test('a Good page with complete checks and no acceptance says checked, not accepted', () => {
  const markup = pageHeaderMarkup(fixture({ complete: true, accepted: false }));
  assert.match(markup, /Good/);
  assert.match(markup, /data-gate-status="Checked · Not accepted"/);
  assert.doesNotMatch(markup, /Before acceptance/);
});

test('accepted and incomplete pages keep distinct gate labels', () => {
  assert.match(pageHeaderMarkup(fixture({ complete: true, accepted: true })), /data-gate-status="Accepted"/);
  assert.match(pageHeaderMarkup(fixture({ complete: false, accepted: false })), /data-gate-status="Not fully checked"/);
});

test('Before acceptance lists only missing requirements with escaped plain reasons', () => {
  const requirements = [
    { id: 'capture', label: 'Screenshots', met: true, missing: '' },
    { id: 'works', label: 'Works answered', met: false, missing: 'Check the <booking> flow.' },
  ];
  const markup = pageHeaderMarkup(fixture({ complete: false, accepted: false, requirements }));
  assert.match(markup, /<summary>Before acceptance<\/summary>/);
  assert.match(markup, /Works answered.*Check the &lt;booking&gt; flow/);
  assert.doesNotMatch(markup, /<li><strong>Screenshots/);
});
