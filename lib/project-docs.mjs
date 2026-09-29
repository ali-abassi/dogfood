import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './paths.mjs';

// The documents every project keeps at its checkout root. Names match case-insensitively (Example App keeps
// DESIGN.md); plan accepts the older plans.md; design prefers the visual brand guide, design.html.
const docFiles = { vision: ['vision.md'], design: ['design.html', 'design.md'], plan: ['plan.md', 'plans.md'] };
const maxBytes = 400_000;

function checkoutRoot(project) {
  if (!project.source?.checkout) return null;
  const checkout = resolve(root, project.source.checkout);
  return existsSync(checkout) ? realpathSync(checkout) : null;
}

// Projects that keep dated plans in docs/plans (Example App) show the newest one when they have no plan.md.
const plansFolder = 'docs/plans';

function filesIn(checkout, folder) {
  const directory = join(checkout, folder);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => statSync(join(directory, name)).isFile()).map(name => folder ? `${folder}/${name}` : name);
}

// Planning follows the working checkout, including uncommitted drafts in the current branch.
function sourceFor(checkout) {
  return { entries: filesIn(checkout, ''), plans: filesIn(checkout, plansFolder), read: file => readFileSync(join(checkout, file), 'utf8') };
}

function newestPlan(source) {
  const file = source.plans.filter(name => name.endsWith('.md')).sort().at(-1);
  return file ? { file, markdown: source.read(file).slice(0, maxBytes) } : null;
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
  const docs = Object.fromEntries(Object.keys(docFiles).map(key => [key, readDoc(source, docFiles[key])]));
  return { checkout: true, ref: 'checkout', ...docs, plan: docs.plan ?? newestPlan(source) };
}

// The brand guide as its own page, for the Docs view's frame and for opening in a tab.
export function designGuide(project) {
  const design = projectDocs(project).design;
  if (!design?.html) throw Object.assign(new Error('This project has no design.html brand guide.'), { status: 404 });
  return design.html;
}
