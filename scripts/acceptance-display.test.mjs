import assert from 'node:assert/strict';
import test from 'node:test';
import { missingRequirementsMarkup, pageHeaderMarkup } from '../public/js/views/page.mjs';
import { aboutMarkup } from '../public/js/views/about.mjs';
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

test('an audit-complete page names the unmet acceptance provenance requirement', () => {
  const requirements = [{ id: 'audit', label: 'Audit', met: true, missing: '' }];
  const acceptanceRequirements = [
    { id: 'audit', label: 'Audit complete', met: true, missing: '' },
    { id: 'provenance', label: 'Declared checkout evidence', met: false, missing: 'The page is not declared to serve this checkout.' },
  ];
  const markup = pageHeaderMarkup(fixture({ complete: true, accepted: false, requirements, acceptanceRequirements }));
  assert.match(markup, /data-gate-status="Checked · Not accepted"/);
  assert.match(markup, /1 requirement remaining/);
  const details = missingRequirementsMarkup(fixture({ acceptanceRequirements }));
  assert.match(details, /Declared checkout evidence.*not declared to serve this checkout/);
  assert.doesNotMatch(markup, /<li><strong>Audit/);
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
  const markup = missingRequirementsMarkup(fixture({ complete: false, accepted: false, requirements }));
  assert.match(markup, /<h2>Before acceptance<\/h2>/);
  assert.match(markup, /Works answered.*Check the &lt;booking&gt; flow/);
  assert.doesNotMatch(markup, /<li><strong>Screenshots/);
});

for (const device of ['desktop', 'mobile']) {
  test(`page details tolerates ${device}-only scan evidence and keeps its links`, () => {
    const page = { features: [], connections: [], scan: { sourceUrl: 'https://example.test/', scannedAt: '2026-11-04T00:00:00Z', viewports: { [device]: { seo: { title: 'One device page' }, links: [{href:'https://example.test/next',text:'Next page'}] } } } };
    const markup = aboutMarkup(page);
    assert.match(markup, /One device page/);
    assert.match(markup, /Next page/);
  });
}
