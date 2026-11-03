import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataDir } from './paths.mjs';

function canonicalDirectory(directory) {
  try { return realpathSync(directory); }
  catch { return resolve(directory); }
}

export function dataStoreIdentity(directory = dataDir) {
  return createHash('sha256').update(`dogfood-data-store-v1\0${canonicalDirectory(directory)}`).digest('hex');
}
