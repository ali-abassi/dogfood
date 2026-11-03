import { projectReadiness } from './project-readiness.mjs';

export function plannedPage(project, pageId) { return projectReadiness(project.id).pages.find(page => page.id === pageId); }
export function linkedProjectPage(project, pageId) {
  const registered = project.pages.find(page => page.id === pageId), planned = plannedPage(project, pageId);
  if (registered) return registered;
  return planned ? { ...planned, planned: true, findings: [] } : null;
}
export function linkedProjectFeature(project, pageId, featureId) {
  const registered = registeredFeature(project, pageId, featureId);
  const planned = plannedPage(project, pageId)?.features.find(feature => feature.id === featureId);
  if (!planned) return registered || null;
  return { ...registered, ...planned, planned: true, registeredExpected: registered?.expected, status: 'untested' };
}
function registeredFeature(project, pageId, featureId) { return project.pages.find(page => page.id === pageId)?.features.find(feature => feature.id === featureId); }
export function knownProjectPageIds(project) {
  return new Set([...project.pages, ...projectReadiness(project.id).pages].map(page => page.id));
}
