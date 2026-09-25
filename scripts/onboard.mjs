import { parseArgs } from 'node:util';
import { onboardProject } from '../lib/onboard.mjs';

const usage = 'Usage: npm run onboard -- <url> [--name N] [--id I] [--profile P]';
const options = { name: { type: 'string' }, id: { type: 'string' }, profile: { type: 'string' } };

function progress({ total, scanned, current }) {
  if (current) process.stderr.write(`Scanning ${scanned + 1} of ${total}: ${current}\n`);
}

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (positionals.length !== 1) throw new Error(usage);
  const result = await onboardProject({ url: positionals[0], name: values.name, id: values.id, browserProfile: values.profile }, progress);
  console.log(`${result.project}: scanned ${result.scanned} of ${result.pageCount} pages; ${result.failed.length} failed. Open it with npm start.`);
  for (const failure of result.failed) process.stderr.write(`${failure.page}: ${failure.error}\n`);
  if (result.failed.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
