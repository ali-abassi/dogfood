import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { readProject, validationError } from './store.mjs';
import { scopeBaselineState, commitManagedScope } from './scope-baseline.mjs';
import { nativeRequestContext } from './source-operator.mjs';

const answerKeys = ['idea', 'audience', 'problem', 'success', 'journey', 'constraints', 'exclusions', 'risks', 'proof'];
const allowed = new Set(['mode', 'expectedRevision', 'answers', 'pages', 'questions', 'decisions']);
const maxBytes = 200_000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const now = () => new Date().toISOString();
const empty = projectId => ({ version: 1, projectId, mode: 'existing', answers: {}, pages: [], questions: [], decisions: [], history: [] });
const words = (value, label, max = 8000) => {
  if (typeof value !== 'string' || value.length > max) throw validationError(`${label} must be text of at most ${max} characters.`);
  return value.trim();
};
function fail(message) { return Object.assign(validationError(message), { status: 409 }); }
function projectFile(projectId) { readProject(projectId); return join(dataDir, 'briefs', `${projectId}.json`); }
function readBrief(projectId) {
  const file = projectFile(projectId);
  if (!existsSync(file)) return empty(projectId);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (value.version !== 1 || value.projectId !== projectId) throw fail('Unsupported project brief.');
  return value;
}
function material(document) { return { mode: document.mode, answers: document.answers, pages: document.pages, questions: document.questions, decisions: document.decisions }; }
function revision(document) { return hash(material(document)); }
function operatorOnly(action) {
  if (nativeRequestContext()) throw fail(`A native request cannot ${action}. Return the proposal for an operator to review and apply.`);
}
function actorName(value) {
  const actor = words(value, 'Decision maker', 120);
  if (!actor) throw validationError('Decision maker is required.');
  return actor;
}
function assertObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Provide a project brief object.');
}
function knownFields(input, keys = allowed) {
  assertObject(input);
  if (Object.keys(input).some(key => !keys.has(key))) throw validationError('Unknown project brief field.');
}
function expected(document, input, file) {
  if (!existsSync(file) && input.expectedRevision === undefined) return;
  if (input.expectedRevision !== revision(document)) throw fail('The project brief changed. Refresh it before saving.');
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function abandonedLock(path) {
  try { const owner = JSON.parse(readFileSync(path, 'utf8')); return Number.isInteger(owner.pid) && owner.pid > 0 && !processAlive(owner.pid); }
  catch { return Date.now() - lstatSync(path, { throwIfNoEntry: false })?.mtimeMs > 30_000; }
}
function createLock(path) {
  const descriptor = openSync(path, 'wx');
  try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid })); }
  finally { closeSync(descriptor); }
}
function claimLock(path) {
  if (existsSync(path) && abandonedLock(path)) rmSync(path, { force: true });
  try { createLock(path); }
  catch { throw fail('This brief is being saved. Try again.'); }
}
function withBrief(projectId, action) {
  const file = projectFile(projectId), lock = `${file}.lock`;
  mkdirSync(join(dataDir, 'briefs'), { recursive: true });
  claimLock(lock);
  try { return action(readBrief(projectId), file); }
  finally { rmSync(lock, { force: true }); }
}
function writeBrief(file, document) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}
function shortId(value, fallback) {
  const candidate = value || fallback;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(candidate)) throw validationError('IDs must use lowercase letters, numbers or dashes.');
  return candidate;
}
function array(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw validationError(`${label} must contain at most ${maximum} entries.`);
  return value;
}
function unique(items, label) {
  if (new Set(items.map(item => item.id)).size !== items.length) throw validationError(`${label} IDs must be unique.`);
  return items;
}
function feature(item, index) {
  knownFields(item, new Set(['id', 'name', 'expected']));
  return { id: shortId(item.id, `feature-${index + 1}`), name: words(item.name, 'Feature name', 160), expected: words(item.expected, 'Expected behavior', 2000) };
}
function page(item, index) {
  knownFields(item, new Set(['id', 'name', 'route', 'features']));
  const route = words(item.route, 'Page route', 1000);
  if (!route.startsWith('/') || route.startsWith('//')) throw validationError('A planned page route must start with /.');
  return { id: shortId(item.id, `page-${index + 1}`), name: words(item.name, 'Page name', 160), route, features: unique(array(item.features, 'Features', 30).map(feature), 'Feature') };
}
function validateMaterial(value) {
  if (value !== undefined && typeof value !== 'boolean') throw validationError('Question material must be boolean.');
}
function requireAnswer(value) {
  if (value.status === 'answered' && !value.answer) throw validationError('An answered question needs its answer.');
}
function question(item, index) {
  knownFields(item, new Set(['id', 'text', 'material', 'status', 'answer']));
  if (!['open', 'answered'].includes(item.status)) throw validationError('A question must be open or answered.');
  validateMaterial(item.material);
  const result = { id: shortId(item.id, `question-${index + 1}`), text: words(item.text, 'Question', 1000), material: item.material !== false, status: item.status, answer: words(item.answer || '', 'Answer', 4000) };
  requireAnswer(result);
  return result;
}
function answers(value) {
  knownFields(value, new Set(answerKeys));
  return Object.fromEntries(answerKeys.map(key => [key, words(value[key] || '', key)]));
}
function choose(input, key, current, transform) { return input[key] === undefined ? current[key] : transform(input[key]); }
function selectedMode(input, current) {
  const mode = input.mode ?? current.mode;
  if (!['new', 'existing'].includes(mode)) throw validationError('Project mode must be new or existing.');
  if (current.mode === 'new' && mode !== 'new') throw fail('A new project cannot bypass scope review by changing to an existing import.');
  return mode;
}
function decision(item, actor, current) {
  const text = words(item, 'Decision', 2000);
  return current.find(value => value.text === text) || { text, by: actor, at: now() };
}
function decisions(value, actor, current) { return array(value, 'Decisions', 60).map(item => decision(item, actor, current)); }
function applyInput(document, input, actor) {
  const result = { ...document, mode: selectedMode(input, document) };
  result.answers = choose(input, 'answers', document, answers);
  result.pages = choose(input, 'pages', document, value => unique(array(value, 'Pages', 40).map(page), 'Page'));
  result.questions = choose(input, 'questions', document, value => unique(array(value, 'Questions', 60).map(question), 'Question'));
  result.decisions = choose(input, 'decisions', document, value => decisions(value, actor, document.decisions));
  return result;
}
function rememberChange(document, previous, actor) {
  document.updatedAt = now(); document.updatedBy = actor;
  if (revision(document) === previous) return;
  document.history = [...document.history, { revision: previous, changedAt: document.updatedAt, by: actor }].slice(-30);
}
export function saveProjectBrief(projectId, input, by) {
  knownFields(input);
  const actor = actorName(by);
  withBrief(projectId, (document, file) => {
    expected(document, input, file);
    const updated = applyInput(document, input, actor);
    rememberChange(updated, revision(document), actor);
    writeBrief(file, updated);
  });
  return projectReadiness(projectId);
}
function checkout(project) {
  if (!project.source.checkout) return null;
  try { return realpathSync(resolve(root, project.source.checkout)); } catch { return null; }
}
function safeDocument(directory, name) {
  const entry = readdirSync(directory).find(value => value.toLowerCase() === name);
  if (!entry) return null;
  const path = join(directory, entry), stat = lstatSync(path);
  if (!stat.isFile() || stat.size > maxBytes) return null;
  if (!realpathSync(path).startsWith(`${directory}${sep}`)) return null;
  return { file: entry, text: readFileSync(path, 'utf8') };
}
function documentFacts(project) {
  const directory = checkout(project);
  if (!directory) return { checkout: false, vision: null, plan: null };
  return { checkout: true, vision: safeDocument(directory, 'vision.md'), plan: safeDocument(directory, 'plan.md') };
}
function compactDocs(docs) {
  return Object.fromEntries(['vision', 'plan'].map(key => [key, docs[key] ? { file: docs[key].file, present: Boolean(docs[key].text.trim()), hash: hash(docs[key].text) } : { present: false }]));
}
function missingAnswers(document) { return answerKeys.filter(key => !document.answers[key]?.trim()).map(key => `Answer ${key}.`); }
function pageProblems(pages) {
  if (!pages.length) return ['Describe at least one page and its features.'];
  return pages.flatMap(item => pageIssue(item));
}
function pageIssue(item) {
  if (!item.name || !item.features.length) return [`Describe ${item.name || item.id} and at least one feature.`];
  return item.features.filter(value => !value.name || !value.expected).map(value => `Describe expected behavior for ${value.name || value.id}.`);
}
function unanswered(document) { return document.questions.filter(item => item.material && item.status === 'open'); }
function draftProblems(document, docs) {
  const questions = unanswered(document).map(item => `Resolve: ${item.text}`);
  const missingDocs = ['vision', 'plan'].filter(key => !docs[key]?.text.trim()).map(key => `Create ${key}.md in the project checkout.`);
  return [...missingAnswers(document), ...pageProblems(document.pages), ...questions, ...missingDocs];
}
function contract(document, docs) { return hash({ brief: material(document), documents: compactDocs(docs) }); }
function stage(document, issues, approved) {
  if (approved) return 'ready';
  if (document.mode === 'existing') return 'existing';
  return issues.length ? 'discovery' : 'scope_review';
}
function approvedScope(document, contractHash, issues) { return document.review?.contractHash === contractHash && issues.length === 0; }
function readinessLabel(existing, approved) {
  if (existing && !approved) return 'Existing project · discovery not certified';
  return approved ? 'Scope reviewed · ready to build' : 'Discovery before first build';
}
function baselineFor(project, document, docs) {
  return document.mode === 'new' ? scopeBaselineState(project, docs) : { ready: true, message: 'Existing project import; discovery is not certified.' };
}
function buildIssues(issues, approved, baseline) {
  if (approved && !baseline.ready) return [...issues, baseline.message];
  return issues;
}
function readinessStage(document, issues, approved, baseline) {
  if (approved && !baseline.ready) return 'baseline';
  return stage(document, issues, approved);
}
function readinessSummary(project, document, docs) {
  const contractHash = contract(document, docs), scopeIssues = draftProblems(document, docs);
  const approved = approvedScope(document, contractHash, scopeIssues), baseline = baselineFor(project, document, docs);
  return { contractHash, scopeIssues, baseline, approved, issues: buildIssues(scopeIssues, approved, baseline) };
}
function buildIsReady(document, summary) { return document.mode === 'existing' || (summary.approved && summary.baseline.ready); }
function projectLabel(document, summary) {
  if (summary.approved && !summary.baseline.ready) return 'Scope reviewed · save source baseline';
  return readinessLabel(document.mode === 'existing', summary.approved);
}
export function projectReadiness(projectId) {
  const project = readProject(projectId), document = readBrief(projectId), docs = documentFacts(project);
  const summary = readinessSummary(project, document, docs);
  return { ...document, ...summary, revision: revision(document), documents: compactDocs(docs), stage: readinessStage(document, summary.issues, summary.approved, summary.baseline), ready: buildIsReady(document, summary), scopeReady: summary.approved, reviewed: summary.approved, imported: document.mode === 'existing', openQuestions: unanswered(document), label: projectLabel(document, summary) };
}
export function reviewProjectScope(projectId, input, by) {
  operatorOnly('approve project scope');
  knownFields(input, new Set(['expectedRevision', 'contractHash', 'note']));
  const actor = actorName(by);
  withBrief(projectId, (document, file) => {
    expected(document, input, file);
    const ready = projectReadiness(projectId);
    if (input.contractHash !== ready.contractHash) throw fail('The project documents or scope changed. Refresh before reviewing.');
    if (ready.scopeIssues.length) throw fail(ready.scopeIssues.join(' '));
    document.review = { contractHash: ready.contractHash, by: actor, at: now(), note: words(input.note || 'Reviewed the scope, boundaries, failure states and required proof.', 'Review note', 2000) };
    writeBrief(file, document);
  });
  return projectReadiness(projectId);
}
export function assertBuildReady(projectId) {
  const ready = projectReadiness(projectId);
  if (!ready.ready) throw fail(`Finish Discovery and review the current scope before the first build. ${ready.issues[0] || 'The scope needs review.'}`);
  return ready;
}
function visionMarkdown(document, project) {
  const headings = { idea: 'Idea', audience: 'Who it is for', problem: 'Problem', success: 'Success', journey: 'Primary journey', constraints: 'Constraints', exclusions: 'Out of scope', risks: 'Failure and recovery', proof: 'Required proof' };
  return `# ${project.name} — Vision\n\n${answerKeys.map(key => `## ${headings[key]}\n\n${document.answers[key] || 'Unanswered.'}`).join('\n\n')}\n`;
}
function planMarkdown(document, project) {
  const pages = document.pages.map(item => `## ${item.name} — ${item.route}\n\n${item.features.map(value => `- **${value.name}:** ${value.expected}`).join('\n')}`).join('\n\n');
  return `# ${project.name} — Plan\n\nDraft scope from Discovery. Review in Dogfood before the first build.\n\n${pages}\n\n## Proof\n\n${document.answers.proof || 'Unanswered.'}\n`;
}
function createDocument(directory, file, content) {
  const path = join(directory, file);
  const existing = readdirSync(directory).find(name => name.toLowerCase() === file);
  if (existing) return { file: existing, created: false };
  writeFileSync(path, content, { flag: 'wx', mode: 0o644 });
  return { file, created: true, hash: hash(content) };
}
export function createReadinessDocuments(projectId, input, by) {
  operatorOnly('write source Vision or Plan documents');
  knownFields(input, new Set(['expectedRevision'])); actorName(by);
  return withBrief(projectId, (document, file) => {
    expected(document, input, file);
    const project = readProject(projectId), directory = checkout(project);
    if (!directory) throw fail('Connect the project checkout before creating documents.');
    const created = [createDocument(directory, 'vision.md', visionMarkdown(document, project)), createDocument(directory, 'plan.md', planMarkdown(document, project))];
    rememberGeneratedDocuments(document, created);
    writeBrief(file, document);
    return { ...projectReadiness(projectId), createdDocuments: created };
  });
}

function rememberGeneratedDocuments(document, created) {
  document.generatedDocuments ??= {};
  for (const entry of created) if (entry.created) document.generatedDocuments[entry.file] = entry.hash;
}
export function saveScopeBaseline(projectId, input, by) {
  operatorOnly('commit the source scope baseline');
  knownFields(input, new Set(['expectedRevision', 'contractHash']));
  const actor = actorName(by);
  return withBrief(projectId, (document, file) => {
    expected(document, input, file);
    const current = projectReadiness(projectId);
    requireBaselineReview(current, input);
    const receipt = commitManagedScope(readProject(projectId), document.generatedDocuments || {});
    document.baselineReceipt = { ...receipt, at: now(), by: actor, contractHash: current.contractHash };
    writeBrief(file, document);
    return projectReadiness(projectId);
  });
}
function requireBaselineReview(current, input) {
  if (current.mode !== 'new' || !current.scopeReady) throw fail('Review the new project scope before saving its source baseline.');
  if (current.contractHash !== input.contractHash) throw fail('The reviewed scope changed. Refresh and review it before saving a baseline.');
  if (current.baseline.ready) throw fail('The reviewed documents are already committed in the source baseline.');
}
