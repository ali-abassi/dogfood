import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './paths.mjs';

// The documents every project keeps at its checkout root. Names match case-insensitively (Example App keeps
// DESIGN.md); plan accepts the older plans.md; design prefers the visual brand guide, design.html.
const docFiles = { vision: ['vision.md'], design: ['design.html', 'design.md'], plan: ['plan.md', 'plans.md'] };
const maxBytes = 400_000;
// Documents come from the default branch, so a shared checkout on another branch still shows what shipped.
const defaultRef = 'origin/main';

function checkoutRoot(project) {
  if (!project.source?.checkout) return null;
  const checkout = resolve(root, project.source.checkout);
  return existsSync(checkout) ? realpathSync(checkout) : null;
}

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', maxBuffer: 8_000_000, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Reads the checkout through git when it has the default branch, else from its files.
function sourceFor(checkout) {
  try {
    const entries = git(checkout, ['ls-tree', '--name-only', defaultRef]).split('\n').filter(Boolean);
    return { entries, read: file => git(checkout, ['show', `${defaultRef}:${file}`]) };
  } catch {
    const entries = readdirSync(checkout).filter(name => statSync(join(checkout, name)).isFile());
    return { entries, read: file => readFileSync(join(checkout, file), 'utf8') };
  }
}

function readDoc(source, names) {
  const file = names.map(name => source.entries.find(entry => entry.toLowerCase() === name)).find(Boolean);
  if (!file) return null;
  const content = source.read(file).slice(0, maxBytes);
  return file.toLowerCase().endsWith('.html') ? { file, html: content } : { file, markdown: content };
}

// Each document is { file, markdown } or { file, html }, or null when the project has none; checkout is false
// when the project has no local checkout, so the app can say why nothing shows.
export function projectDocs(project) {
  const checkout = checkoutRoot(project);
  if (!checkout) return { checkout: false, vision: null, design: null, plan: null };
  const source = sourceFor(checkout);
  return { checkout: true, ...Object.fromEntries(Object.keys(docFiles).map(key => [key, readDoc(source, docFiles[key])])) };
}

// The brand guide as its own page, for the Docs view's frame and for opening in a tab.
export function designGuide(project) {
  const design = projectDocs(project).design;
  if (!design?.html) throw Object.assign(new Error('This project has no design.html brand guide.'), { status: 404 });
  return design.html;
}
