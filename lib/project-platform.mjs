import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Pure helper imports must not initialize paths.mjs before a caller selects DOGFOOD_DATA.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function platformError(message) { return Object.assign(new Error(message), { status: 400 }); }
export function strictKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw platformError(`${label} must be an object.`);
  if (Object.keys(value).some(key => !keys.includes(key))) throw platformError(`${label} contains an unsupported field.`);
}
export function platformText(value, label, maximum = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) throw platformError(`${label} is required and must be at most ${maximum} characters.`);
  return value.trim();
}
export function platform(source = {}) { return source.platform ?? 'web'; }
export function requiredDevices(value = {}) {
  if (value.requiredDevices) return value.requiredDevices;
  if (value.scan?.captureDevices) return value.scan.captureDevices;
  return sourceDevices(sourceOf(value));
}
function sourceDevices(source) {
  return source.captureDevices ?? defaultDevices(source);
}
function defaultDevices(source) {
  return platform(source) === 'ios' ? ['mobile'] : ['desktop', 'mobile'];
}
export function checkedProfile(source) {
  if (!['web', 'ios', 'cli'].includes(platform(source))) throw platformError('Platform must be web, ios or cli.');
  const captureDevices = checkedDevices(source);
  const profile = { platform: platform(source), captureDevices };
  if (profile.platform === 'ios') profile.bundleId = checkedBundle(source.bundleId);
  return profile;
}
function invalidDeviceList(list) { return !Array.isArray(list) || !list.length || list.length > 2; }
function assertDeviceList(list) {
  if (invalidDeviceList(list)) throw platformError('captureDevices must be a nonempty desktop/mobile subset.');
  if (new Set(list).size !== list.length || list.some(device => !['desktop', 'mobile'].includes(device))) throw platformError('captureDevices contains an invalid or duplicate device.');
}
function checkedDevices(source) {
  const list = requiredDevices(source);
  assertDeviceList(list);
  if (platform(source) === 'ios' && JSON.stringify(list) !== '["mobile"]') throw platformError('iOS requires only the mobile capture device.');
  return ['desktop', 'mobile'].filter(device => list.includes(device));
}
export function checkedBundle(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value)) throw platformError('A valid iOS bundleId is required.');
  return value;
}
export function evidenceProfile(source = {}) {
  return { ...checkedProfile(source), checkout: source.checkout ?? null, browserProfile: source.browserProfile ?? null };
}
export function profileHash(source) { return createHash('sha256').update(JSON.stringify(evidenceProfile(source))).digest('hex'); }
export function platformPage(project, page) {
  return { ...page, platformSupport: pagePlatformSupport(project.source, page), platform: platform(project.source), requiredDevices: requiredDevices(project), evidenceProfile: profileHash(project.source), profileRequired: project.source.captureDevices !== undefined,
    deviceLabels: { desktop: 'Computer', mobile: platform(project.source) === 'ios' ? 'iPhone / Simulator' : 'Phone' } };
}
export function iosSourceUrl(source, value) {
  const prefix = `ios://${checkedBundle(source.bundleId)}/`;
  if (typeof value !== 'string' || !value.startsWith(prefix)) throw platformError('Native source URL must identify the declared iOS bundle.');
  const screen = value.slice(prefix.length);
  if (!/^[A-Za-z0-9/_-]{1,300}$/.test(screen) || screen.split('/').includes('..')) throw platformError('Native source URL needs a screen identity without query or fragment.');
  return value;
}
export function nativePageUrl(source, page) {
  const route = page.route.replace(/^\/+/, '');
  return iosSourceUrl(source, page.url ?? `ios://${source.bundleId}/${route}`);
}
function checkedCheckout(value) {
  const directory = resolve(root, platformText(value, 'Checkout'));
  if (!existsSync(directory) || !statSync(directory).isDirectory()) throw platformError('Checkout must be an existing directory.');
  return value.trim();
}
function checkedUrl(source) {
  if (source.url === null) return;
  if (!URL.canParse(source.url) || !['http:', 'https:'].includes(new URL(source.url).protocol)) throw platformError('Source URL must be HTTP(S) or null.');
}
export function configuredSource(previous, input) {
  strictKeys(input, ['platform', 'captureDevices', 'bundleId', 'checkout', 'url', 'servesCheckout', 'environment', 'browserProfile'], 'Source');
  const source = { ...previous, ...input };
  configureProfile(previous, input, source);
  if (input.checkout !== undefined) source.checkout = checkedCheckout(input.checkout);
  if (source.servesCheckout !== undefined && typeof source.servesCheckout !== 'boolean') throw platformError('servesCheckout must be boolean.');
  checkedSourceText(source, input);
  checkedUrl(source);
  return source;
}

function checkedSourceText(source, input) {
  for (const key of ['environment', 'browserProfile']) {
    if (input[key] !== undefined) source[key] = platformText(input[key], key, 200);
  }
  if (input.bundleId !== undefined) checkedBundle(input.bundleId);
}

function sourceOf(value) { return value.source ?? value; }

export function pagePlatformSupport(source, page) {
  if (platform(source) !== 'ios') return { supported: true };
  try { return { supported: true, sourceUrl: nativePageUrl(source, page) }; }
  catch { return { supported: false, kind: 'historical-outside-profile', reason: 'This historical page is outside the iOS evidence profile. Its existing QA history is preserved and cannot count as native app verification.' }; }
}

function configureProfile(previous, input, source) {
  resetChangedPlatformDevices(previous, input, source);
  const profile = checkedProfile(source);
  if (input.platform !== undefined) source.platform = profile.platform;
  if (input.captureDevices !== undefined) source.captureDevices = profile.captureDevices;
}
function resetChangedPlatformDevices(previous, input, source) {
  if (input.platform === undefined || platform(previous) === input.platform) return;
  if (input.captureDevices === undefined) delete source.captureDevices;
}
