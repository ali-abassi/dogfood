import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const data = mkdtempSync(join(tmpdir(), 'dogfood-report-'));
cpSync(fileURLToPath(new URL('../demo', import.meta.url)), data, { recursive: true });
process.env.DOGFOOD_DATA = data;
const { projectReport } = await import('../lib/report.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

test('the report leads with what needs attention and lists every page and open issue', () => {
  const report = projectReport('tidepool', new Date('2026-09-26T00:00:00Z'));
  assert.match(report, /^# Tidepool \(demo\): is it working\?\n\n2026-09-26 · /);
  assert.ok(report.indexOf('## Needs attention') < report.indexOf('## Pages'));
  assert.match(report, /- Classes changed since its last check; look at it again\./);
  assert.match(report, /\*\*1\*\* page needs a fresh page check\./);
  assert.match(report, /\| Page \| Route \| Looks right \| Clear purpose \| Easy to use \| Safe \| Fast & findable \| Works as expected \|/);
  for (const name of ['Home', 'Classes', 'Book a lesson', 'Sign in', 'Staff schedule']) assert.match(report, new RegExp(`\\| ${name} \\|`));
  assert.match(report, /- Book a lesson, Works as expected: /, 'answers that need work lead');
  assert.match(report, /- \*\*Annoying\*\* · .+ \(Book a lesson, TP-001\)/);
  assert.doesNotMatch(report, /\bP[0-3]\b/, 'severity codes stay out of the report');
  assert.ok(report.indexOf('TP-001') < report.indexOf('TP-002'), 'issues are ordered by severity');
  assert.match(report, /## What this does not prove/);
  assert.match(report, /- Staff schedule, not checked yet: Looks right, Clear purpose, Easy to use, Safe, Fast & findable, Works as expected\./, 'what is open comes from the answers');
  assert.doesNotMatch(report, /Nothing beyond the scan/);
});
