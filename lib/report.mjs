import { answerDefinitions } from './answers.mjs';
import { severityNames } from './schema.mjs';
import { projectView, readProject } from './store.mjs';

// A Markdown summary of where a project's QA stands, for people to share and agents to report.
// It states what is proven and what is not; it never turns counts into a score.
const severityOrder = ['P0', 'P1', 'P2', 'P3'];
const answerWords = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked' };

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
  const unchecked = count('untested') + count('in_review') + count('blocked');
  return [
    `- ${counted(count('pass'), 'page is', 'pages are')} good, ${counted(count('needs_work'), 'needs', 'need')} work, and ${counted(unchecked, 'is', 'are')} not fully checked yet.`,
    `- ${counted(pages.filter(page => page.progress.changedSinceReview).length, 'page changed since its', 'pages changed since their')} last check.`,
    `- ${counted(pages.filter(page => page.progress.requirements.some(item => ['capture', 'scan'].includes(item.id) && !item.met)).length, 'page needs', 'pages need')} a fresh page check.`,
  ];
}

function attentionLines(pages, issues) {
  const blocking = issues.filter(item => ['P0', 'P1'].includes(item.severity)).map(item => `- ${severityNames[item.severity]}: ${item.title} (${item.page.name}, ${item.id})`);
  const answers = pages.flatMap(page => page.progress.answers.filter(answer => answer.status === 'needs_work').map(answer => `- ${page.name}, ${answer.name}: ${cell(answer.summary)}`));
  const changed = pages.filter(page => page.progress.changedSinceReview).map(page => `- ${page.name} changed since its last check; look at it again.`);
  const lines = [...blocking, ...answers, ...changed];
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
  const open = page.progress.answers.filter(answer => answer.status === 'untested' || answer.status === 'partial');
  return open.length ? `- ${page.name}: not answered yet: ${open.map(answer => answer.name).join(', ')}.` : '';
}

function boundaryLines(pages) {
  const notes = pages.flatMap(page => [openLine(page), page.qa.note ? `- ${page.name}, in the checker's words: ${page.qa.note}` : '']).filter(Boolean);
  return [
    '- Screenshots and page checks prove how pages look and what they load, not that everything people can do works; Works as expected needs someone to try each thing.',
    '- An answer marked as the AI\'s comes from reading the screenshots only; a person\'s or agent\'s answer outranks it.',
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
    '## Summary', '', ...summaryLines(project.pages),
    '', '## Needs attention', '', ...attentionLines(project.pages, issues),
    '', '## Pages', '', ...pagesHeader, ...project.pages.map(pageRow),
    '', '## Open bugs', '', ...issueLines(issues),
    '', '## What this does not prove', '', ...boundaryLines(project.pages),
    '',
  ].join('\n');
}
