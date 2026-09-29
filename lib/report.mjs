import { answerDefinitions } from './answers.mjs';
import { severityNames } from './schema.mjs';
import { projectView, readProject } from './store.mjs';
import { pageLiveDebts } from './completion.mjs';
import { auditRowFresh } from './audit-evidence.mjs';

// A Markdown summary of where a project's QA stands, for people to share and agents to report.
// It states what is proven and what is not; it never turns counts into a score.
const severityOrder = ['P0', 'P1', 'P2', 'P3'];
const answerWords = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked', blocked: 'Blocked', recheck: 'Recheck', awaiting_live: 'Awaiting live verification' };

function cell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function openIssues(pages) {
  const issues = pages.flatMap(page => page.findings.filter(item => item.status === 'open').map(item => ({ ...item, page })));
  return issues.sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
}

function counted(count, one, many) {
  return `**${count}** ${count === 1 ? one : many}`;
}

function summaryLines(pages) {
  const count = status => pages.filter(page => page.progress.status === status).length;
  const unchecked = count('untested') + count('in_review') + count('blocked') + count('awaiting_live');
  return [
    `- ${counted(count('pass'), 'page is', 'pages are')} good, ${counted(count('needs_work'), 'needs', 'need')} work, and ${counted(unchecked, 'is', 'are')} not fully checked yet.`,
    `- ${counted(pages.filter(page => page.progress.changedSinceReview).length, 'page changed since its', 'pages changed since their')} last check.`,
    `- ${counted(pages.filter(page => page.progress.requirements.some(item => ['capture', 'scan'].includes(item.id) && !item.met)).length, 'page needs', 'pages need')} a fresh page check.`,
    `- ${counted(pages.filter(page => page.progress.accepted).length, 'page is', 'pages are')} accepted for release.`,
    `- ${counted(pages.flatMap(pageLiveDebts).length, 'feature awaits', 'features await')} live verification; local release acceptance does not close this debt.`,
  ];
}

function attentionLines(pages, issues) {
  const open = issues.map(item => `- ${severityNames[item.severity]}: ${item.title} (${item.page.name}, ${item.id})`);
  const answers = pages.flatMap(page => page.progress.answers.filter(answer => ['needs_work', 'blocked'].includes(answer.status)).map(answer => `- ${page.name}, ${answer.name}: ${cell(answer.summary)}`));
  const changed = pages.filter(page => page.progress.changedSinceReview).map(page => `- ${page.name} changed since its last check; look at it again.`);
  const incomplete = pages.flatMap(page => page.progress.requirements.filter(item => !item.met && (item.id.startsWith('feature:') || item.id.startsWith('audit:'))).map(item => `- ${page.name}, ${item.id}: ${cell(item.missing)}`));
  const debt = pages.flatMap(page => pageLiveDebts(page).map(feature => `- ${page.name}, ${feature.name}: ${debtText(feature)} ${cell(feature.liveDebt.reason)}`));
  const lines = [...open, ...answers, ...incomplete, ...changed, ...debt];
  return lines.length ? lines : ['- Nothing needs work, and no page changed since its last check.'];
}

function pageRow(page) {
  const answers = page.progress.answers.map(answer => answerWords[answer.status]);
  return `| ${cell(page.name)} | \`${cell(page.route)}\` | ${answers.join(' | ')} |`;
}

const pagesHeader = [
  `| Page | Route | ${answerDefinitions.map(item => item.name).join(' | ')} |`,
  `| --- | --- | ${answerDefinitions.map(() => '---').join(' | ')} |`,
];

function issueLines(issues) {
  if (!issues.length) return ['No open bugs.'];
  return issues.map(item => `- **${severityNames[item.severity]}** · ${cell(item.title)} (${cell(item.page.name)}, ${item.id})`);
}

// What is still open on each page comes from its answers, so it can never go stale.
function openLine(page) {
  const open = page.progress.answers.filter(answer => ['untested', 'partial', 'recheck'].includes(answer.status));
  return open.length ? `- ${page.name}, not checked yet: ${open.map(answer => answer.name).join(', ')}.` : '';
}

function boundaryLines(pages) {
  const notes = pages.flatMap(page => [openLine(page), page.qa.note ? `- ${page.name}, in the reviewer's words: ${page.qa.note}` : '']).filter(Boolean);
  return [
    '- Screenshots and page checks prove how pages look and what they load, not that everything people can do works; Works as expected needs someone to try each thing.',
    '- An answer marked as the AI\'s comes from reading the screenshots only; a person\'s or agent\'s answer outranks it.',
    '- Awaiting live verification is deferred proof, not a Good feature. Recording a deployment reopens these checks until they are explicitly verified against a fresh live scan.',
    ...carriedLines(pages),
    ...notes,
  ];
}

function debtText(feature) {
  return feature.liveDebt.state === 'pending' ? 'Live verification pending after deployment.' : 'Deferred until deployment and live verification.';
}

function carriedLines(pages) {
  return pages.flatMap(page => Object.values(page.audit).flat().filter(row => row.carriedFrom).map(row =>
    `- ${page.name}, carried question: ${cell(row.question)} Original verdict by ${cell(row.by)} at ${cell(row.at)}; ${carryText(page, row)} This does not add provider proof.`));
}

function carryText(page, row) {
  return auditRowFresh(page, row, page.progress.checkoutFingerprint) ? 'matching declared scan facts and context retained it.' : 'the earlier carry no longer matches current declared evidence; check it again.';
}

export function projectReport(projectId, now = new Date()) {
  const project = projectView(readProject(projectId));
  const issues = openIssues(project.pages);
  return [
    `# ${project.name}: is it working?`,
    '',
    `${now.toISOString().slice(0, 10)} · ${project.source.url ?? "Checkout only"} · ${project.pages.length} pages`,
    '',
    '## Summary', '', ...summaryLines(project.pages),
    '', '## Needs attention', '', ...attentionLines(project.pages, issues),
    '', '## Pages', '', ...pagesHeader, ...project.pages.map(pageRow),
    '', '## Open bugs', '', ...issueLines(issues),
    '', '## What this does not prove', '', ...boundaryLines(project.pages),
    '',
  ].join('\n');
}
