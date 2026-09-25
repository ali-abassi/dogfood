import { readJson } from '../api.mjs';
import { escapeHtml, scanPosition } from '../format.mjs';
import { state } from '../state.mjs';
import { loadProject, render } from '../app.mjs';

const addProjectCopy = {
  welcome: { eyebrow: 'Welcome to dogfood', title: 'Add your first project', lede: 'Start with a product URL. dogfood finds its pages and scans each one on desktop and mobile.' },
  add: { eyebrow: 'New project', title: 'Add project', lede: 'Enter a URL and dogfood finds its pages and scans each one on desktop and mobile.' },
};

export const idleOnboarding = { job: '', running: false, total: null, scanned: 0, current: null, error: '' };

function onboardingButtonText() {
  if (!state.onboarding.running) return 'Add and scan';
  return state.onboarding.job ? 'Scanning…' : 'Adding project…';
}

function onboardingNoticeMarkup() {
  const progress = state.onboarding.running ? `<p class="onboarding-progress" role="status">${onboardingProgressText()}</p>` : '';
  const error = state.onboarding.error ? `<p class="form-error" role="alert">${escapeHtml(state.onboarding.error)}</p>` : '';
  return `${progress}${error}`;
}

export function addProjectFormMarkup(welcome) {
  const copy = addProjectCopy[welcome ? 'welcome' : 'add'];
  const disabled = state.onboarding.running ? 'disabled' : '';
  const cancel = welcome ? '' : `<button class="text-button" type="button" data-action="cancel-add-project" ${disabled}>Cancel</button>`;
  const draft = state.projectDraft;
  return `<section class="add-project-panel content-panel" aria-label="Add project">
    <header class="add-project-heading"><p class="page-route">${copy.eyebrow}</p><h1>${copy.title}</h1><p>${copy.lede}</p></header>
    <form id="add-project-form" novalidate>
      <fieldset ${disabled}>
        <label for="product-url">Product URL<input id="product-url" name="url" type="url" required inputmode="url" placeholder="https://example.com" value="${escapeHtml(draft.url)}"></label>
        <label for="project-name">Name <span class="field-optional">Optional</span><input id="project-name" name="name" type="text" value="${escapeHtml(draft.name)}"></label>
        <label for="browser-profile">Chrome profile <span class="field-optional">Optional</span><input id="browser-profile" name="browserProfile" type="text" value="${escapeHtml(draft.browserProfile)}" aria-describedby="browser-profile-hint"></label>
        <p class="field-hint" id="browser-profile-hint">Chrome profile for signed-in pages, e.g. Default</p>
        <label class="capture-choice"><input type="checkbox" name="aiReview" ${draft.aiReview ? 'checked' : ''}> Also ask AI to suggest each page’s features (about half a cent per page)</label>
      </fieldset>
      ${onboardingNoticeMarkup()}
      <div class="form-actions"><button class="save-button" type="submit" ${disabled}>${onboardingButtonText()}</button>${cancel}</div>
    </form>
  </section>`;
}

function onboardingProgressText() {
  if (state.onboarding.total === null) return 'Finding pages…';
  const verb = state.onboarding.phase === 'review' ? 'Asking AI about' : 'Scanning';
  return `${verb} ${escapeHtml(scanPosition(state.onboarding))}`;
}

export function welcomeMarkup() {
  return `<main class="welcome-state">${addProjectFormMarkup(true)}</main>`;
}

function isHttpUrl(value) {
  return URL.canParse(value ?? '') && ['http:', 'https:'].includes(new URL(value).protocol);
}

// Only fields the person filled in are sent; the server fills in the rest.
function onboardingInput(form) {
  const data = new FormData(form);
  const fields = Object.fromEntries(['url', 'name', 'browserProfile'].map(key => [key, String(data.get(key) ?? '').trim()]).filter(([, value]) => value));
  return data.has('aiReview') ? { ...fields, aiReview: true } : fields;
}

function failOnboarding(message) {
  state.onboarding = { ...state.onboarding, running: false, error: message };
  render();
}

export async function submitOnboarding(form) {
  const input = onboardingInput(form);
  state.projectDraft = { url: '', name: '', browserProfile: '', ...input };
  if (!isHttpUrl(input.url)) return failOnboarding('Enter the product URL, starting with http:// or https://.');
  state.onboarding = { ...idleOnboarding, running: true };
  render();
  try {
    const { job } = await readJson('/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    state.onboarding.job = job;
    await followOnboarding(job);
  } catch (error) { failOnboarding(error.message); }
}

// Polls the onboarding job once a second until it finishes, then opens the new project.
async function followOnboarding(job) {
  const status = await readJson(`/api/jobs/${encodeURIComponent(job)}`);
  if (status.status === 'failed') throw new Error(status.error || 'Onboarding failed.');
  if (status.status === 'done') return openOnboardedProject(status.projectId);
  Object.assign(state.onboarding, { phase: status.phase, total: status.total, scanned: status.scanned, current: status.current });
  render();
  await new Promise(done => setTimeout(done, 1000));
  return followOnboarding(job);
}

async function openOnboardedProject(id) {
  state.projects = await readJson('/api/projects');
  await loadProject(id);
}
