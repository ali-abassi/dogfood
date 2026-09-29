import { existsSync, realpathSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { root } from './paths.mjs';
import { createProject, listProjects, readProject, text, validationError, writeProject } from './store.mjs';

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function checkoutPath(input) {
  const path = resolve(input.checkout ?? process.cwd());
  if (!existsSync(path)) throw validationError('Local checkout does not exist.');
  return realpathSync(path);
}

function sameCheckout(project, checkout) {
  try { return Boolean(project.source.checkout) && realpathSync(resolve(root, project.source.checkout)) === checkout; } catch { return false; }
}

function checkedUrl(value) {
  if (!URL.canParse(value) || !['http:', 'https:'].includes(new URL(value).protocol)) throw validationError('Product URL must be HTTP(S).');
  return value;
}

// Idempotent checkout-first setup; no app, provider, browser, or files in the checkout are needed.
function newProjectInput(input, checkout) {
  return { ...input, id: input.id ?? slug(basename(checkout)), checkout, name: input.name ?? basename(checkout) };
}

function updateCheckoutMapping(source, value) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') throw validationError('servesCheckout must be boolean.');
  source.servesCheckout = value;
}

function updateInitialized(project, input) {
  if (input.url) {
    const url = checkedUrl(input.url);
    if (url !== project.source.url) delete project.source.servesCheckout;
    project.source.url = url;
  }
  updateCheckoutMapping(project.source, input.servesCheckout);
  if (input.environment) project.source.environment = text(input.environment, 'Environment', 1, 200);
  return writeProject(project);
}

export function initProject(input = {}) {
  const checkout = checkoutPath(input);
  const candidate = newProjectInput(input, checkout);
  const existing = listProjects().find(project => project.id === candidate.id);
  if (!existing) return createProject(candidate);
  const project = readProject(candidate.id);
  if (!sameCheckout(project, checkout)) throw validationError(`Project ${candidate.id} belongs to another checkout; choose a different id.`);
  return updateInitialized(project, input);
}

export function attachProjectUrl(projectId, url, servesCheckout) {
  const project = readProject(projectId);
  return updateInitialized(project, { url, servesCheckout });
}

export function projectFromCheckout(checkout = process.cwd()) {
  let path = realpathSync(checkout);
  const projects = listProjects().map(project => readProject(project.id));
  while (true) {
    const project = projects.find(project => sameCheckout(project, path));
    if (project) return project.id;
    const parent = dirname(path);
    if (parent === path) return null;
    path = parent;
  }
}
