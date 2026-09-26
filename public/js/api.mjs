import { state } from './state.mjs';

// The browser's own message for a dropped connection ("Failed to fetch") means nothing to a person.
async function reach(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error('The request did not reach dogfood. Check that dogfood is still running, then try again.');
  }
}

export async function readJson(url, options) {
  const response = await reach(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function visualEndpoint(key) {
  const [projectId, pageId] = key.split('/');
  return `/api/projects/${projectId}/pages/${pageId}/visual-review`;
}

export function qaEndpoint(key) {
  const [projectId, pageId] = key.split('/');
  return `/api/projects/${projectId}/pages/${pageId}/qa-runs`;
}

export function findingEndpoint(page, id = '') {
  return `/api/projects/${state.project.id}/pages/${page.id}/findings${id ? `/${id}` : ''}`;
}
