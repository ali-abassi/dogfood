import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './paths.mjs';

export const visualPromptVersion = 'page-answers-v6';
const brandKeys = ['principles', 'brand', 'visual', 'typography', 'spacing', 'components', 'voice', 'imagery', 'motion', 'accessibility'];
const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const capturePresent = capture => Boolean(capture?.state === 'rendered' && capture.fullPage);

export function visualCoverage(captures) {
  const reviewedDevices = ['desktop', 'mobile'].filter(device => capturePresent(captures[device]));
  return { reviewedDevices, notReviewedDevices: ['desktop', 'mobile'].filter(device => !reviewedDevices.includes(device)), complete: reviewedDevices.length === 2 };
}

function brandFile(project) {
  return project.source?.checkout ? join(resolve(root, project.source.checkout), 'design.json') : null;
}

function readBrand(project) {
  const file = brandFile(project);
  if (!file || !existsSync(file)) return { status: 'not_supplied', reference: null };
  if (statSync(file).size > 65_536) return { status: 'too_large', reference: 'design.json' };
  try { return compactBrand(JSON.parse(readFileSync(file, 'utf8'))); }
  catch { return { status: 'unreadable', reference: 'design.json' }; }
}

function compactBrand(value) {
  const selected = Object.fromEntries(brandKeys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  const text = JSON.stringify(selected);
  return { status: 'supplied', reference: 'design.json', contract: text.slice(0, 12_000), truncated: text.length > 12_000 };
}

function captureContext(captures) {
  return Object.fromEntries(['desktop', 'mobile'].map(device => [device, deviceContext(captures[device])]));
}

function deviceContext(capture = {}) {
  return { sourceUrl: capture.sourceUrl ?? null, environment: capture.environment ?? null, viewport: capture.viewport ?? null };
}

function audience(project, page) { return page.audience || project.audience || 'Audience not supplied.'; }

function pageContext(project, page) {
  return {
    name: normalized(page.name), route: normalized(page.route),
    audience: normalized(audience(project, page)),
    question: normalized(page.mainQuestion || 'Infer only what the screenshot shows; the intended screen question was not supplied.'),
    primaryAction: normalized(page.primaryAction || 'Intended primary action not supplied.'),
    features: (page.features ?? []).slice(0, 30).map(feature => ({ name: normalized(feature.name), expected: normalized(feature.expected) })),
  };
}

export function visualContract(project, page) {
  const body = { promptVersion: visualPromptVersion, schemaVersion: 2, guidelines: (project.guidelines ?? []).map(normalized), brand: readBrand(project), page: pageContext(project, page), coverage: visualCoverage(page.captures), captureContext: captureContext(page.captures) };
  return { ...body, hash: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

export function reviewContractStale(review, context) {
  if (review.promptVersion !== visualPromptVersion || !review.contract?.hash) return true;
  if (!context) return false;
  return review.contract.hash !== visualContract(context.project, context.page).hash;
}

// Device identity is the explicit leading label of each evidence location. Page text such as
// "phone number" describes content; it must never be treated as proof of a mobile screenshot.
export function assertEvidenceDevices(analysis, coverage) {
  for (const item of analysis.evidence) {
    const device = evidenceDevice(item.location);
    if (!coverage.reviewedDevices.includes(device)) throw new Error(`Model returned ${device} evidence without a ${device} screenshot.`);
  }
}

function evidenceDevice(location) {
  const prefix = /^\s*(desktop|mobile|computer|phone)\b/i.exec(location);
  if (!prefix) throw new Error('Visual evidence locations must begin with the supplied desktop or mobile device.');
  return { desktop: 'desktop', computer: 'desktop', mobile: 'mobile', phone: 'mobile' }[prefix[1].toLowerCase()];
}
