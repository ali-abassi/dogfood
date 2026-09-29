import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export function setupMissing(message) {
  return Object.assign(new Error(`Scan setup required: ${message}`), { code: 'SETUP_MISSING', status: 409 });
}

function httpTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw setupMissing('provide a valid HTTP page address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw setupMissing('use an HTTP address without embedded credentials.');
  return url;
}

export function configuredPageUrl(project, page) {
  if (page.url) return page.url;
  if (project.source.url) return new URL(page.route, project.source.url).href;
  const remembered = rememberedUrl(page);
  if (remembered) return remembered;
  throw setupMissing(`Page ${page.id} needs an address.`);
}

function rememberedUrl(page) {
  return page.scan?.sourceUrl || page.captures?.desktop.sourceUrl;
}

function shortText(value, maximum) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

// Replace only the origin. Registered routes keep their exact query and hash, including hash routers.
export function livePageUrl(project, page, liveUrl) {
  const configured = httpTarget(configuredPageUrl(project, page));
  const live = httpTarget(liveUrl);
  return `${live.origin}${configured.pathname}${configured.search}${configured.hash}`;
}

function localAddress(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
}

function roleName(value) {
  if (value == null) return null;
  if (!shortText(value, 100)) throw setupMissing('requiredRole must be a short role name.');
  return value.trim();
}

export function fixtureNames(value) {
  if (value == null) return [];
  const names = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(names)) throw setupMissing('fixtures must be a list of configured names.');
  if (names.length > 10) throw setupMissing('fixtures must be a list of up to ten configured names.');
  return [...new Set(names.map(fixtureName))];
}

function fixtureName(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw setupMissing('fixture names must be short names, not commands.');
  return value;
}

export function checkedRoleProof(proof) {
  if (!proof || typeof proof !== 'object') throw setupMissing('declare roleProof with a selector and expectedText visible on the page.');
  const selector = proof.selector;
  const expectedText = proof.expectedText;
  if (!shortText(selector, 300)) throw setupMissing('roleProof needs a bounded DOM selector.');
  if (!shortText(expectedText, 200)) throw setupMissing('roleProof needs bounded visible expectedText.');
  return { selector, expectedText: expectedText.trim().replace(/\s+/g, ' ') };
}

function requiredRole(page, options) {
  const declared = roleName(page.requiredRole);
  const requested = roleName(options.requiredRole);
  if (declared && requested && declared !== requested) throw setupMissing(`this page requires the ${declared} role; choose its profile manually.`);
  return requested || declared;
}

export function effectiveProfile(project, options = {}) {
  return options.browserProfile ?? project.source.browserProfile ?? null;
}

function profileName(project, options) {
  const profile = effectiveProfile(project, options);
  if (profile === null) return null;
  if (!shortText(profile, 100)) throw setupMissing('browserProfile must name a manually prepared profile.');
  return profile;
}

function requiredFixtures(page, requested, environment) {
  const required = fixtureNames(page.fixture);
  if (environment === 'live' && (requested.length || required.length)) throw setupMissing('fixtures run only on local targets; use a local scan with explicit fixture opt-in.');
  if (required.some(name => !requested.includes(name))) throw setupMissing(`opt in to the page fixtures: ${required.join(', ')}.`);
}

function selectedUrl(project, page, options) {
  return options.liveUrl ? livePageUrl(project, page, options.liveUrl) : httpTarget(configuredPageUrl(project, page)).href;
}

function targetEnvironment(sourceUrl, options) {
  if (options.liveUrl) return 'live';
  return localAddress(httpTarget(sourceUrl)) ? 'local' : 'live';
}

function roleContext(page, required, profile) {
  if (!required) return null;
  if (!profile) throw setupMissing(`choose a manually prepared browserProfile for the ${required} role.`);
  return checkedRoleProof(page.roleProof);
}

export function scanTarget(project, page, options = {}) {
  const configuredSourceUrl = configuredPageUrl(project, page);
  const sourceUrl = selectedUrl(project, page, options);
  const environment = targetEnvironment(sourceUrl, options);
  const browserProfile = profileName(project, options);
  const required = requiredRole(page, options);
  const fixture = fixtureNames(options.fixtures);
  requiredFixtures(page, fixture, environment);
  const roleProof = roleContext(page, required, browserProfile);
  return { sourceUrl, configuredSourceUrl, environment, browserProfile, requiredRole: required, fixture, roleProof, liveUrl: options.liveUrl ?? null };
}

function insideDirectory(root, directory) {
  const inside = relative(root, directory);
  return !inside.startsWith('..') && !isAbsolute(inside);
}

function boundedList(value, maximum) {
  return Array.isArray(value) && value.length > 0 && value.length <= maximum;
}

function fixtureDirectory(checkout, configured) {
  const root = realpathSync(checkout);
  if (configured && isAbsolute(configured)) throw setupMissing('fixture cwd must stay inside the local checkout.');
  const directory = realpathSync(resolve(root, configured || '.'));
  if (!insideDirectory(root, directory)) throw setupMissing('fixture cwd must stay inside the local checkout.');
  return directory;
}

function validTimeout(timeout) {
  return Number.isInteger(timeout) && timeout >= 100 && timeout <= 30_000;
}

function configuredFixture(project, name) {
  return project.fixtureSetup?.[name] || {};
}

function fixtureCommand(project, name) {
  const fixture = configuredFixture(project, name);
  if (!boundedList(fixture.argv, 40)) throw setupMissing(`configure an argv command for fixture ${name}.`);
  if (fixture.argv.some(arg => !shortText(arg, 2000))) throw setupMissing(`fixture ${name} has invalid argv.`);
  const timeout = fixture.timeoutMs ?? 10_000;
  if (!validTimeout(timeout)) throw setupMissing(`fixture ${name} timeout must be 100–30000 milliseconds.`);
  return { argv: fixture.argv, timeout, cwd: fixture.cwd };
}

export async function runLocalFixtures(project, target, checkout) {
  if (!target.fixture.length) return;
  if (target.environment !== 'local') throw setupMissing('fixtures run only on local targets.');
  if (!checkout) throw setupMissing('fixtures need a configured local checkout.');
  for (const name of target.fixture) await runFixture(project, name, checkout);
}

async function runFixture(project, name, checkout) {
  const { argv, timeout, cwd } = fixtureCommand(project, name);
  try { await execute(argv[0], argv.slice(1), { cwd: fixtureDirectory(checkout, cwd), timeout, killSignal: 'SIGKILL', maxBuffer: 50_000 }); }
  catch { throw setupMissing(`fixture ${name} failed or timed out; fix the local setup command and try again.`); }
}

export function roleProofScript(proof) {
  return `(() => {
    const proof = ${JSON.stringify(proof)};
    try {
      return [...document.querySelectorAll(proof.selector)].slice(0, 20).some(element =>
        element.getClientRects().length > 0 && element.checkVisibility({ visibilityProperty: true }) &&
        element.innerText?.slice(0, 500).trim().replace(/\\s+/g, ' ') === proof.expectedText);
    } catch { return false; }
  })()`;
}

export async function verifyRole(browser, target) {
  if (!target.requiredRole) return null;
  if (await browser.evaluate(roleProofScript(target.roleProof)) !== true) throw setupMissing(`visible proof of the ${target.requiredRole} role is absent or mismatched; prepare the chosen profile manually.`);
  return target.requiredRole;
}
