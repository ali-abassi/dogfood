import { randomUUID, createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { capturesDir } from './paths.mjs';
import { servedImagePattern } from './schema.mjs';
function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function position(value) { if (!Number.isFinite(value) || value < 0 || value > 1) fail('Choose a point within the screenshot.'); return value; }
function currentCapture(page, input) {
  if (!['desktop', 'mobile'].includes(input.device)) fail('Choose computer or phone.');
  const capture = page.captures[input.device];
  if (capture.state !== 'rendered' || capture.sha256 !== input.captureSha256) fail('The screenshot changed. Reload before saving feedback.');
  if (!servedImagePattern.test(capture.path)) fail('The screenshot path is invalid.');
  return capture;
}
function captureDirectory(projectId) {
  const path = join(capturesDir, projectId);
  if (lstatSync(path).isSymbolicLink()) fail('Project screenshots cannot use a symbolic directory.');
  const directory = realpathSync(path);
  if (!directory.startsWith(`${realpathSync(capturesDir)}${sep}`)) fail('Project screenshots must stay inside capture storage.');
  return directory;
}
function checkedBytes(file, directory, hash) {
  if (!realpathSync(file).startsWith(`${directory}${sep}`) || !lstatSync(file).isFile()) fail('The screenshot must be a local regular file.');
  const bytes = readFileSync(file);
  if (bytes.length > 30_000_000 || createHash('sha256').update(bytes).digest('hex') !== hash) fail('The screenshot bytes changed. Check the page again.');
  return bytes;
}
function snapshot(projectId, capture, id) {
  const directory = captureDirectory(projectId), file = join(capturesDir, capture.path.slice('/captures/'.length));
  const bytes = checkedBytes(file, directory, capture.sha256), history = join(directory, 'history');
  mkdirSync(history, { recursive: true });
  if (!realpathSync(history).startsWith(`${directory}${sep}`)) fail('Screenshot history must stay inside the project.');
  writeFileSync(join(history, `annotation-${id}.png`), bytes, { flag: 'wx' });
  return `/captures/${projectId}/history/annotation-${id}.png`;
}
export function annotationFields(input, page, projectId) {
  if (!input.annotation) return {};
  const value = input.annotation, capture = currentCapture(page, value), id = randomUUID();
  const x = position(value.x), y = position(value.y);
  return { annotation: { id, device: value.device, x, y, capture: { path: snapshot(projectId, capture, id), sha256: capture.sha256, capturedAt: capture.capturedAt, sourceUrl: capture.sourceUrl, viewport: capture.viewport } } };
}
