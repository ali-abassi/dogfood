import { state } from './state.mjs';

export async function readJson(url, options) {
  const response = await fetch(url, options);
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
