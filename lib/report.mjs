import { projectView, readProject } from './store.mjs';

// A Markdown summary of where a project's QA stands, for people to share and agents to report.
// It states what is proven and what is not; it never turns counts into a score.
const severityOrder = ['P0', 'P1', 'P2', 'P3'];
const statusNames = { blocked: 'Blocked', untested: 'Untested', in_review: 'In review', pass: 'Pass', needs_work: 'Needs work' };

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

function summaryLines(pages, issues) {
  const count = predicate => pages.filter(predicate).length;
  const blocking = issues.filter(item => ['P0', 'P1'].includes(item.severity)).length;
  return [
    `- **${count(page => page.progress.complete)} of ${pages.length}** pages have complete QA.`,
    `- ${counted(count(page => page.progress.status === 'needs_work'), 'page needs', 'pages need')} work; ${counted(blocking, 'open P0/P1 issue', 'open P0/P1 issues')}.`,
    `- ${counted(count(page => page.progress.changedSinceReview), 'page changed', 'pages changed')} visually since review.`,
    `- ${counted(count(page => page.progress.requirements.some(item => ['capture', 'scan'].includes(item.id) && !item.met)), 'page needs', 'pages need')} a scan.`,
  ];
}

function attentionLines(pages, issues) {
  const blocking = issues.filter(item => ['P0', 'P1'].includes(item.severity)).map(item => `- ${item.severity} ${item.id} on ${item.page.name}: ${item.title}`);
  const problems = pages.flatMap(page => page.progress.scanProblems.map(problem => `- Scan on ${page.name}: ${problem}`));
  const changed = pages.filter(page => page.progress.changedSinceReview).map(page => `- ${page.name} changed since its review; recheck the verdicts.`);
  const lines = [...blocking, ...problems, ...changed];
  return lines.length ? lines : ['- Nothing urgent: no open P0/P1 issues, no scan problems, and no pages changed since review.'];
}

function missingText(page) {
  const unmet = page.progress.requirements.filter(item => !item.met).map(item => item.label);
  return unmet.length ? unmet.join('; ') : 'QA complete';
}

function pageRow(page) {
  const open = page.findings.filter(item => item.status === 'open').length;
  const scanned = page.scan ? page.scan.scannedAt.slice(0, 10) : 'never';
  return `| ${cell(page.name)} | \`${cell(page.route)}\` | ${statusNames[page.progress.status]} | ${open} | ${scanned} | ${cell(missingText(page))} |`;
}

function issueLines(issues) {
  if (!issues.length) return ['No open issues.'];
  return issues.map(item => `- **${item.severity} ${item.id}** (${cell(item.page.name)}): ${cell(item.title)}`);
}

function boundaryLines(pages) {
  const notes = pages.filter(page => page.qa.note).map(page => `- ${page.name}: ${page.qa.note}`);
  return [
    '- Screenshots and scans prove how pages render and what they request, not that every feature works.',
    '- Verdicts are the reviewer\'s evidence notes; the AI review is a provisional clarity estimate, not acceptance.',
    ...notes,
  ];
}

export function projectReport(projectId, now = new Date()) {
  const project = projectView(readProject(projectId));
  const issues = openIssues(project.pages);
  return [
    `# ${project.name}: QA report`,
    '',
    `${now.toISOString().slice(0, 10)} · ${project.source.url} · ${project.pages.length} pages`,
    '',
    '## Summary', '', ...summaryLines(project.pages, issues),
    '', '## Needs attention', '', ...attentionLines(project.pages, issues),
    '', '## Pages', '', '| Page | Route | Status | Open issues | Last scan | Missing before QA is complete |', '| --- | --- | --- | --- | --- | --- |', ...project.pages.map(pageRow),
    '', '## Open issues', '', ...issueLines(issues),
    '', '## What this does not prove', '', ...boundaryLines(project.pages),
    '',
  ].join('\n');
}
