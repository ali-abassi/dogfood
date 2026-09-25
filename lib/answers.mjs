import { devices } from './schema.mjs';

// The six things every page answers for its owner, in the order they are shown (user-stated,
// 2026-09-26: "think of the user as non technical, they want to know if their app is working").
export const answerDefinitions = [
  { id: 'design', name: 'Looks right', question: 'Does it look finished and match the rest of the app?' },
  { id: 'purpose', name: 'Clear purpose', question: 'Is it clear why this page exists?' },
  { id: 'ease', name: 'Easy to use', question: 'Can people find and do things easily, on a phone and a computer?' },
  { id: 'safety', name: 'Safe', question: 'Is it protected from hackers and from people copying its data?' },
  { id: 'speed', name: 'Fast & findable', question: 'Does it load quickly and show up properly in search?' },
  { id: 'works', name: 'Works as expected', question: 'Does everything you can do here work, with no bugs?' },
];

// The AI's scale says below 7 "a visitor must guess or the page looks broken", which is what
// Needs work means to an owner; 7 and above is usable, and the reason names any friction.
const aiGoodScore = 7;
// ponytail: one load-time bar for both devices; revisit when scans time real networks, not localhost.
const slowLoadMs = 3000;
const deviceWords = { desktop: 'computer', mobile: 'phone' };
const unjudged = {
  design: 'Ask AI to check the screenshots, or compare the page with the rest of your app.',
  purpose: 'Ask AI to check the screenshots, or say what this page is for.',
  ease: 'Ask AI to check the screenshots, or try the page on a phone and a computer.',
};

function part(status, text, source = {}) {
  return { status, text, ...source };
}

function counted(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

function aiPart(key, ai) {
  const judgment = ai?.dimensions?.[key];
  if (!judgment) return part('untested', unjudged[key]);
  return part(judgment.score >= aiGoodScore ? 'pass' : 'needs_work', judgment.reason, { source: 'ai', at: ai.at });
}

// A person's or agent's verdict wins; otherwise the AI review of the current screenshots answers.
function judgedPart(page, key, ai) {
  const verdict = page.checks[key];
  if (verdict.status === 'untested') return aiPart(key, ai);
  return part(verdict.status, verdict.note, { source: 'verdict', by: verdict.by, at: verdict.at });
}

function checklistPart(rows, topic) {
  const needs = rows.find(row => row.status === 'needs_work');
  if (needs) return part('needs_work', `Needs work: ${needs.question}`, { source: 'checklist' });
  const answered = rows.filter(row => row.status === 'pass').length;
  if (answered === rows.length) return part('pass', `All ${counted(rows.length, `${topic} question`, `${topic} questions`)} answered.`, { source: 'checklist' });
  const status = answered ? 'partial' : 'untested';
  return part(status, `${answered} of ${counted(rows.length, `${topic} question`, `${topic} questions`)} answered.`, { source: 'checklist' });
}

function sidewaysPart(scan) {
  const device = devices.find(name => scan?.viewports[name].horizontalOverflow);
  return device ? part('needs_work', `Scrolls sideways on a ${deviceWords[device]}.`, { source: 'scan', at: scan.scannedAt }) : null;
}

function unnamedPart(scan) {
  if (!scan) return null;
  const total = devices.reduce((sum, name) => sum + Object.values(scan.viewports[name].accessibility).reduce((a, b) => a + b, 0), 0);
  return total ? part('needs_work', `${counted(total, 'image, field, or button has', 'images, fields, or buttons have')} no name a screen reader can read.`, { source: 'scan', at: scan.scannedAt }) : null;
}

function loadPart(scan) {
  if (!scan) return part('untested', 'Not timed yet. Check the page to measure it.');
  const times = devices.map(name => [name, scan.viewports[name].loadMs]);
  if (times.some(([, ms]) => ms === null)) return part('untested', 'The load time was not measured.', { source: 'scan', at: scan.scannedAt });
  const [slowDevice, slowest] = times.reduce((worst, entry) => (entry[1] > worst[1] ? entry : worst));
  if (slowest > slowLoadMs) return part('needs_work', `Takes ${seconds(slowest)} to load on a ${deviceWords[slowDevice]}.`, { source: 'scan', at: scan.scannedAt });
  return part('pass', `Loads in ${seconds(times[0][1])} on a computer and ${seconds(times[1][1])} on a phone.`, { source: 'scan', at: scan.scannedAt });
}

function brokenText(broken) {
  return `${broken[0].name} does not work as expected${broken.length > 1 ? ` (and ${broken.length - 1} more)` : ''}.`;
}

function workingText(count) {
  return count === 1 ? 'The one thing you can do here works.' : `All ${count} things you can do here work.`;
}

const fromThings = { source: 'things' };

function featuresPart(features) {
  if (!features.length) return part('untested', 'Nothing listed to check yet. Add what people can do here.');
  const broken = features.filter(item => item.status === 'needs_work');
  if (broken.length) return part('needs_work', brokenText(broken), fromThings);
  const checked = features.filter(item => item.status === 'pass').length;
  if (checked === features.length) return part('pass', workingText(checked), fromThings);
  return part(checked ? 'partial' : 'untested', `${checked} of ${counted(features.length, 'thing', 'things')} you can do here checked.`, fromThings);
}

function bugsPart(findings) {
  const open = findings.filter(item => item.status === 'open');
  return open.length ? part('needs_work', `${counted(open.length, 'open bug', 'open bugs')}: ${open[0].title}`, { source: 'bugs' }) : null;
}

function errorsPart(scan) {
  if (!scan) return null;
  const total = devices.reduce((sum, name) => sum + scan.viewports[name].pageErrors.length + scan.viewports[name].failedRequests.length, 0);
  return total ? part('needs_work', `The page check found ${counted(total, 'error', 'errors')}.`, { source: 'scan', at: scan.scannedAt }) : null;
}

const testsParts = {
  failed: qa => part('needs_work', 'The automated tests fail.', { source: 'tests', at: qa.latest.finishedAt }),
  passed: qa => part('pass', 'The automated tests pass.', { source: 'tests', at: qa.latest.finishedAt }),
};

function testsPart(qa) {
  if (!qa.tests.length) return null;
  return testsParts[qa.latest?.status]?.(qa) ?? part('untested', 'The automated tests have not run yet.');
}

const partsFor = {
  design: (page, ai) => [judgedPart(page, 'design', ai)],
  purpose: (page, ai) => [judgedPart(page, 'purpose', ai)],
  ease: (page, ai) => [judgedPart(page, 'ease', ai), sidewaysPart(page.scan), unnamedPart(page.scan), checklistPart(page.audit.accessibility, 'accessibility')],
  safety: page => [checklistPart(page.audit.security, 'security'), checklistPart(page.audit.scraping, 'copying')],
  speed: page => [loadPart(page.scan), checklistPart(page.audit.seo, 'search')],
  works: page => [featuresPart(page.features), bugsPart(page.findings), errorsPart(page.scan), testsPart(page.qa)],
};

function answerStatus(parts) {
  if (parts.some(item => item.status === 'needs_work')) return 'needs_work';
  if (parts.every(item => item.status === 'pass')) return 'pass';
  return parts.some(item => item.status !== 'untested') ? 'partial' : 'untested';
}

// The one-line summary leads with what is wrong, then with what is left to check.
function leadPart(parts) {
  const first = status => parts.find(item => item.status === status);
  return first('needs_work') ?? first('untested') ?? first('partial') ?? parts[0];
}

// `ai` is the current AI review ({ dimensions, at }) or null when there is none for these screenshots.
export function pageAnswers(page, ai) {
  return answerDefinitions.map(definition => {
    const parts = partsFor[definition.id](page, ai).filter(Boolean);
    return { ...definition, status: answerStatus(parts), summary: leadPart(parts).text, parts };
  });
}
