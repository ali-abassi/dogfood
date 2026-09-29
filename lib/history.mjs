import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { capturesDir } from './paths.mjs';
import { pageById, readProject } from './store.mjs';

const devices = ['desktop', 'mobile'];
const maximumShots = 500;

// A replaced screenshot is archived as <name>-<replaced at>.png by a rename, which keeps its modified
// time, so that time is when the screenshot was taken.
function archivedShots(projectId, name) {
  const directory = join(capturesDir, projectId, 'history');
  if (!existsSync(directory)) return [];
  const pattern = new RegExp(`^${name}-\\d{13}\\.png$`);
  return readdirSync(directory).filter(file => pattern.test(file)).map(file => ({
    path: `/captures/${projectId}/history/${file}`,
    takenAt: statSync(join(directory, file)).mtime.toISOString(),
  }));
}

function currentShot(capture) {
  return capture?.state === 'rendered' ? [{ path: capture.path, takenAt: capture.capturedAt }] : [];
}

function deviceShots(projectId, page, device) {
  const name = device === 'mobile' ? `${page.id}-mobile` : page.id;
  return [...currentShot(page.captures[device]), ...archivedShots(projectId, name)]
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt))
    .slice(0, maximumShots);
}

// Every screenshot dogfood has kept of a page, newest first, per device: the timeline of how it changed.
export function captureHistory(projectId, pageId) {
  const page = pageById(readProject(projectId), pageId);
  return Object.fromEntries(devices.map(device => [device, deviceShots(projectId, page, device)]));
}
