import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.mjs';
import { readProject, validationError } from './store.mjs';

const markerName = '.dogfood-qa-workspace.json';
const fail = message => Object.assign(validationError(message), { status: 409 });
function git(path, args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'user.name=Dogfood QA', '-c', 'user.email=local-qa@dogfood.invalid', '-C', path, ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}
function regular(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw fail('The managed QA workspace contains unsupported files. Preserve it and inspect locally.');
}
function safeDirectory(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw fail('The managed QA workspace must be an owned regular directory.');
  if (!stat) mkdirSync(path);
}
function marker(projectId) { return `${JSON.stringify({ version: 1, projectId, purpose: 'url-only-qa', applicationSource: false })}\n`; }
function readme(projectId) {
  return `# Dogfood URL-only audit workspace\n\nProject: ${projectId}\n\nThis managed repository is only an execution baseline for auditing the project's configured URL. It is not the application's source checkout and its revision does not identify deployed application code. Application source remains unknown. Read pages, record evidence and findings through Dogfood, and preserve explicit unverified boundaries. Do not build, integrate, deploy or claim source verification from this workspace.\n`;
}
function validateOwned(path, projectId) {
  regular(join(path, markerName)); regular(join(path, 'README.md'));
  if (readFileSync(join(path, markerName), 'utf8') !== marker(projectId)) throw fail('This QA folder is not the managed workspace for this project.');
  if (readFileSync(join(path, 'README.md'), 'utf8') !== readme(projectId)) throw fail('The managed QA README changed. Preserve the existing files and inspect locally.');
  const unexpected = readdirSync(path).filter(name => !['.git', markerName, 'README.md'].includes(name));
  if (unexpected.length) throw fail('The managed QA workspace contains local files. Preserve them before another audit.');
}
function initialize(path) {
  const existing = lstatSync(join(path, '.git'), { throwIfNoEntry: false });
  if (existing) return existingBaseline(path);
  git(path, ['init', '-q']);
  validateRepository(path);
  git(path, ['add', '--', markerName, 'README.md']);
  git(path, ['commit', '-qm', 'Create audit-only execution baseline']);
}
function validateRepository(path) {
  safeDirectory(join(path, '.git'));
  const top = realpathSync(git(path, ['rev-parse', '--show-toplevel']).trim());
  const common = realpathSync(git(path, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
  if (top !== realpathSync(path) || common !== realpathSync(join(path, '.git'))) throw fail('The managed QA repository points outside its owned execution workspace.');
}
function existingBaseline(path) {
  validateRepository(path);
  try { git(path, ['rev-parse', '--verify', 'HEAD']); }
  catch { throw fail('The owned QA baseline is incomplete. Preserve it and inspect locally before retrying.'); }
}
function prepare(path, projectId) {
  const exists = lstatSync(path, { throwIfNoEntry: false });
  if (!exists) {
    mkdirSync(path);
    writeFileSync(join(path, markerName), marker(projectId), { flag: 'wx', mode: 0o600 });
    writeFileSync(join(path, 'README.md'), readme(projectId), { flag: 'wx', mode: 0o600 });
  }
  safeDirectory(path); validateOwned(path, projectId); initialize(path);
  if (git(path, ['status', '--porcelain', '--untracked-files=all']).trim()) throw fail('The managed QA execution baseline has local changes. Preserve and inspect them before retrying.');
  return { path: realpathSync(path), revision: git(path, ['rev-parse', '--verify', 'HEAD']).trim(), auditOnly: true };
}

export function managedQaWorkspace(projectId) {
  const project = readProject(projectId);
  if (!project.source.url) throw fail('Add the application address before starting URL-only QA.');
  const base = join(realpathSync(dataDir), 'qa-workspaces');
  safeDirectory(base);
  return prepare(join(base, projectId), projectId);
}
