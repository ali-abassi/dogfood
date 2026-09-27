import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixFirstFindings, openFindings } from '../public/js/state.mjs';

const finding = (id, severity, status, at) => ({ id, severity, status, title: `${id} title`, at });
const page = (id, name, findings) => ({ id, name, findings });

test('a page lists its open bugs worst and oldest first', () => {
  const home = page('home', 'Home', [
    finding('QA-1', 'P3', 'open', '2026-09-20T10:00:00.000Z'),
    finding('QA-2', 'P1', 'resolved', '2026-09-19T10:00:00.000Z'),
    finding('QA-3', 'P0', 'open', '2026-09-22T10:00:00.000Z'),
    finding('QA-4', 'P0', 'open', '2026-09-21T10:00:00.000Z'),
  ]);
  assert.deepEqual(openFindings(home).map(item => item.id), ['QA-4', 'QA-3', 'QA-1']);
});

test('Fix first keeps open P0–P2 across pages, worst and oldest first', () => {
  const pages = [
    page('home', 'Home', [finding('QA-1', 'P2', 'open', '2026-09-22T10:00:00.000Z')]),
    page('book', 'Book', [finding('QA-2', 'P0', 'open'), finding('QA-3', 'P3', 'open', '2026-09-19T10:00:00.000Z')]),
    page('about', 'About', [finding('QA-4', 'P1', 'open', '2026-09-21T10:00:00.000Z')]),
  ];
  const items = fixFirstFindings(pages);
  assert.deepEqual(items.map(item => item.finding.id), ['QA-2', 'QA-4', 'QA-1']);
  assert.deepEqual(items.map(item => item.page.id), ['book', 'about', 'home']);
  assert.equal(fixFirstFindings([page('empty', 'Empty', [])]).length, 0);
});
