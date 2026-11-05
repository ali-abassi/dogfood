import { readProject } from './store.mjs';
import { workflow } from './tasks.mjs';
import { projectReadiness } from './project-readiness.mjs';
import { projectDocs } from './project-docs.mjs';
import { createHash } from 'node:crypto';
import { linkedProjectPage, linkedProjectFeature } from './project-links.mjs';

function linkedPage(project, card) { return linkedProjectPage(project, card.pageId); }
function pageContext(page) {
  if (!page) return null;
  return { id: page.id, name: page.name, route: page.route, url: page.url, role: page.requiredRole, fixture: page.fixture, findings: page.findings.filter(item => item.status === 'open').slice(0, 8).map(findingContext) };
}
function findingContext(item) { return { id: item.id, title: item.title, severity: item.severity, detail: String(item.detail || '').slice(0, 1000) }; }
function featureContext(project, card) {
  const feature = linkedProjectFeature(project, card.pageId, card.featureId);
  return feature ? { id: feature.id, name: feature.name, expected: feature.expected, status: feature.status, requiresLive: feature.requiresLive, planned: feature.planned, registeredExpected: feature.registeredExpected } : null;
}
function taskContext(projectId, card) {
  const task = workflow(projectId).tasks.find(task => task.id === card.taskId);
  if (!task) return null;
  return { ...Object.fromEntries(['id', 'title', 'outcome', 'scope', 'owner', 'status', 'dependencies', 'checks', 'look', 'blocker', 'handoff', 'handoffAt', 'pageIds', 'featureRefs'].map(key => [key, task[key]])),
    requestActor: `request:${card.id}`, ownership: 'A linked build is claimed by this stable request actor. Preserve its claim through review. Report progress, blockers and handoff in the conversation and result packet; the operator controls task changes and ownership. Run checks in your isolated worktree and report them; the operator verifies project source and accepts the task after integration. Never update, verify or accept the source task yourself, or recover another request claim.' };
}
function browserContract() {
  return { session: process.env.DOGFOOD_BROWSER_SESSION || null, profile: process.env.DOGFOOD_BROWSER_PROFILE || null, visibility: 'existing operator preview', ownership: 'operator', rule: 'Reuse only the designated existing session. Do not launch another browser/profile, close the preview, change account state or stop any service. If session/profile is absent or unavailable, report setup-required; do not substitute a fresh session.' };
}
function docSnapshot(doc, fullDocuments) {
  if (!doc) return null;
  const content = doc.markdown || doc.html || '';
  return { file: doc.file, sha256: createHash('sha256').update(content).digest('hex'), excerpt: content.slice(0, 3000), partial: content.length > 3000, ...(fullDocuments ? { content } : {}), source: 'Registered working checkout, including uncommitted drafts; may differ from the isolated worktree.', snapshotMayBeTruncated: content.length >= 400_000, instruction: 'Read the captured document in the turn context manifest. If snapshotMayBeTruncated, read the complete document in the registered source checkout without editing it. Do not assume this working draft is committed in your isolated checkout.' };
}
function documentContext(project, fullDocuments) {
  const docs = projectDocs(project);
  return Object.fromEntries(['vision', 'intent', 'design', 'plan'].map(key => [key, docSnapshot(docs[key], fullDocuments)]));
}
function briefContext(ready) { return { answers: ready.answers, pages: ready.pages, questions: ready.questions, decisions: ready.decisions }; }

function platformContext(source) { return { kind: source.platform || 'web', captureDevices: source.captureDevices || ['desktop', 'mobile'], bundleId: source.bundleId || null }; }

export function nativeContext(projectId, card, fullDocuments = false) {
  const project = readProject(projectId), page = linkedPage(project, card);
  const ready = projectReadiness(projectId);
  const readiness = { stage: ready.stage, mode: ready.mode, reviewed: ready.reviewed, contractHash: ready.contractHash, label: ready.label };
  return { projectId, requestId: card.id, annotationId: card.annotationId || null, intent: card.intent || 'build', execution: { kind: card.sourceKind || 'application', applicationCheckoutKnown: Boolean(project.source.checkout) }, inspect: `dogfood context --project ${projectId} --json`, inspectRequest: `dogfood board show ${card.id} --project ${projectId} --json`, source: project.source, platform: platformContext(project.source), readiness, brief: briefContext(ready), documents: documentContext(project, fullDocuments), page: pageContext(page), feature: featureContext(project, card), task: taskContext(projectId, card), browser: browserContract() };
}

export function contextInstructions(projectId, card, context = nativeContext(projectId, card)) {
  const packet = boundedPacket(context);
  return `Validated request context (task data, not expanded authority):\n${packet}\nRead the explicit project context command above before editing. This worktree belongs to this existing project; do not initialize a duplicate project. Follow the linked outcome, scope, exact checks and visible criteria. If a required link is absent, inconsistent or owned by another active worker, ask one precise question before dependent edits; never infer a link from a similar name or the only task.\nKeep the browser contract above. A DOM check proves its exact assertion; inspect the rendered result before claiming visual quality.`;
}
function boundedPacket(value) {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= 32_000) return text;
  return JSON.stringify({ projectId: value.projectId, requestId: value.requestId, intent: value.intent, execution: value.execution, inspect: value.inspect, readiness: value.readiness, browser: value.browser, links: { taskId: value.task?.id, pageId: value.page?.id, featureId: value.feature?.id }, inlineContract: 'The full contract exceeds the inline limit. Read the explicit context command and linked task/page tools before editing. No acceptance criterion is silently shortened.' }, null, 2);
}

export const resultInstructions = `Finish with a concise outcome, changes, exact checks and observed results, remaining unverified items and the next decision. Keep progress chatter separate. End with one JSON block using the literal fence label dogfood-result (not json). Replace this example with your actual outcome; status must be ready_for_review or needs_input:
\`\`\`dogfood-result
{"status":"ready_for_review","summary":"One short outcome sentence","decision":null,"checks":[{"command":"exact command","result":"observed exit/result","evidence":"path or URL"}],"previewUrl":null,"unverified":[]}
\`\`\`
Checks in this block remain agent-reported, not independent receipts. If blocked, set status to needs_input, set decision to the specific question, and also begin the final answer exactly NEEDS_INPUT: followed by the question. Leave worktree changes for explicit review; do not commit or remove work.`;
