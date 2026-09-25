import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const dataDir = resolve(root, process.env.DOGFOOD_DATA || 'data');
export const projectsDir = join(dataDir, 'projects');
export const capturesDir = join(dataDir, 'captures');
export const runsDir = join(dataDir, 'runs');
