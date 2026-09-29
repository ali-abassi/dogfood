import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './paths.mjs';

// The three documents every project keeps at its checkout root. Names match case-insensitively
// (Example App keeps DESIGN.md), and plan accepts the older plans.md spelling.
const docFiles = { vision: ['vision.md'], design: ['design.md'], plan: ['plan.md', 'plans.md'] };
const maxBytes = 400_000;

function checkoutRoot(project) {
  if (!project.source?.checkout) return null;
  const checkout = resolve(root, project.source.checkout);
  return existsSync(checkout) ? realpathSync(checkout) : null;
}

function readDoc(checkout, names, entries) {
  const file = entries.find(name => names.includes(name.toLowerCase()));
  if (!file) return null;
  const path = join(checkout, file);
  if (!statSync(path).isFile()) return null;
  return { file, markdown: readFileSync(path, 'utf8').slice(0, maxBytes) };
}

// Each document is { file, markdown } or null when the project has none; checkout is null when
// the project has no local checkout, so the app can say why nothing shows.
export function projectDocs(project) {
  const checkout = checkoutRoot(project);
  const entries = checkout ? readdirSync(checkout) : [];
  const docs = Object.fromEntries(Object.keys(docFiles).map(key => [key, checkout ? readDoc(checkout, docFiles[key], entries) : null]));
  return { checkout: Boolean(checkout), ...docs };
}
