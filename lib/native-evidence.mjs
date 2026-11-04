import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Resolve the same repository root without freezing DOGFOOD_DATA during pure helper imports.
// The server keeps its environment stable; test callers select their data directory before invoking evidence reads.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { iosSourceUrl, nativePageUrl, platform, platformError, platformText, profileHash, strictKeys } from './project-platform.mjs';
const hashPattern = /^[a-f0-9]{64}$/;
export function checkedHash(value, label) {
  if (!hashPattern.test(value ?? '')) throw platformError(`${label} must be a SHA-256 fingerprint.`);
  return value;
}
function checkedApp(source, app) {
  strictKeys(app, ['bundleId', 'version', 'build'], 'Native app');
  if (app.bundleId !== source.bundleId) throw platformError('The captured app bundle does not match this project.');
  return { bundleId: app.bundleId, version: platformText(app.version, 'App version', 100), build: platformText(app.build, 'App build', 100) };
}
function checkedDevice(device) {
  strictKeys(device, ['simulatorUDID', 'name', 'os'], 'Native device');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(device.simulatorUDID ?? '')) throw platformError('A real Simulator UDID is required.');
  return { simulatorUDID: device.simulatorUDID.toUpperCase(), name: platformText(device.name, 'Device name', 120), os: platformText(device.os, 'Device OS', 120) };
}
function matchedBuild(build, fingerprint) {
  if (checkedHash(build.sourceFingerprint, 'Build source fingerprint') !== fingerprint) throw platformError('Build source fingerprint does not match the captured checkout.');
  const artifactFile = platformText(build.artifactFile, 'Built app executable file', 1000);
  const artifactSha256 = createHash('sha256').update(artifactBytes(artifactFile)).digest('hex');
  if (checkedHash(build.artifactSha256, 'Built artifact hash') !== artifactSha256) throw platformError('Built app executable bytes do not match artifactSha256.');
  return { sourceFingerprint: fingerprint, artifactSha256, artifactFile };
}
function checkedBuild(build, fingerprint) {
  strictKeys(build, ['sourceProof', 'sourceFingerprint', 'artifactFile', 'artifactSha256', 'note'], 'Native build');
  if (!['matched', 'unknown'].includes(build.sourceProof)) throw platformError('Build sourceProof must be matched or unknown.');
  const proof = build.sourceProof === 'matched' ? matchedBuild(build, fingerprint) : {};
  return { sourceProof: build.sourceProof, note: nativeNote(build.note, 'Build proof note'), ...proof };
}
function checkedManualCheck(key, value) {
  strictKeys(value, key === 'launch' ? ['status', 'note', 'milliseconds'] : ['status', 'note'], `Native ${key} check`);
  if (!['pass', 'needs_work'].includes(value.status)) throw platformError('Native check status must be pass or needs_work.');
  const check = { status: value.status, note: nativeNote(value.note, `${key} evidence note`) };
  if (key === 'launch') check.milliseconds = checkedTiming(value.milliseconds);
  return check;
}
function checkedTiming(value) {
  if (!Number.isFinite(value) || value < 0 || value > 600000) throw platformError('Launch timing requires measured milliseconds.');
  return value;
}
function checkedManualChecks(value = {}) {
  strictKeys(value, ['launch', 'accessibility', 'logs'], 'Native checks');
  return Object.fromEntries(Object.entries(value).map(([key, check]) => [key, checkedManualCheck(key, check)]));
}
export function nativeRecord(project, page, input, fingerprint) {
  strictKeys(input, ['file', 'sourceUrl', 'actor', 'sourceFingerprint', 'app', 'device', 'build', 'checks'], 'Native evidence');
  if (platform(project.source) !== 'ios') throw platformError('Native evidence requires an iOS project.');
  if (checkedHash(input.sourceFingerprint, 'Source fingerprint') !== fingerprint) throw platformError('The checkout changed or has no verified source fingerprint.');
  const sourceUrl = iosSourceUrl(project.source, input.sourceUrl);
  if (sourceUrl !== nativePageUrl(project.source, page)) throw platformError('Native screen identity does not match the registered page.');
  return { kind: 'native', checkedAt: new Date().toISOString(), sourceUrl, sourceFingerprint: fingerprint, profileHash: profileHash(project.source), actor: platformText(input.actor, 'Actor', 120),
    app: checkedApp(project.source, input.app), device: checkedDevice(input.device), build: checkedBuild(input.build, fingerprint), checks: checkedManualChecks(input.checks) };
}
export function nativeCheckCurrent(page, fingerprint = null) {
  const check = page.nativeCheck;
  if (!usableCheck(check)) return false;
  if (!nativeCaptureMatches(page, check)) return false;
  return check.sourceFingerprint === fingerprint;
}
function nativeCaptureMatches(page, check) {
  const capture = page.captures.mobile;
  const identities = [check.profileHash === page.evidenceProfile, check.sourceUrl === capture.sourceUrl, check.captureSha256 === capture.sha256, capture.fingerprint === check.sourceFingerprint];
  return identities.every(Boolean) && nativeDeviceMatches(check, capture) && nativeBuildMatches(check, capture) && captureBytesMatch(capture);
}
function nativeDeviceMatches(check, capture) {
  return JSON.stringify(check.device) === JSON.stringify(capture.native?.device) && JSON.stringify(check.app) === JSON.stringify(capture.native?.app);
}
function captureBytesMatch(capture) {
  const file = join(resolve(root, process.env.DOGFOOD_DATA || 'data'), capture.path);
  return existsSync(file) && createHash('sha256').update(readFileSync(file)).digest('hex') === capture.sha256;
}
export function nativeAnswerPart(page, name) {
  const check = page.nativeCheck?.checks?.[name];
  if (!check) return { status: 'untested', text: `Native ${name} evidence has not been recorded.`, source: 'native' };
  return { status: check.status, text: check.note, source: 'native', at: page.nativeCheck.checkedAt };
}

function usableCheck(check) {
  if (check?.build?.sourceProof !== 'matched') return false;
  return validBuildReceipt(check);
}
function validBuildReceipt(check) {
  return check.build.sourceFingerprint === check.sourceFingerprint && hashPattern.test(check.build.artifactSha256 ?? '') && typeof check.build.artifactFile === 'string';
}

function nativeBuildMatches(check, capture) { return JSON.stringify(check.build) === JSON.stringify(capture.native?.build); }

function nativeNote(value, label) {
  const note = platformText(value, label, 1200);
  if (note.length < 12) throw platformError(`${label} needs at least 12 characters of specific evidence.`);
  return note;
}

function artifactBytes(file) {
  try { return readFileSync(file); }
  catch { throw platformError('Built app executable file cannot be read. Choose an existing readable file.'); }
}
