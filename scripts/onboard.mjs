import { parseArgs } from 'node:util';
import { onboardProject } from '../lib/onboard.mjs';

const usage = 'Usage: npm run onboard -- <url> [--name N] [--id I] [--profile P] [--ai-review]';
const options = { name: { type: 'string' }, id: { type: 'string' }, profile: { type: 'string' }, 'ai-review': { type: 'boolean' } };

const phases = { scan: 'Scanning', review: 'AI review' };

function progress({ phase, total, scanned, current }) {
  if (current) process.stderr.write(`${phases[phase]} ${scanned + 1} of ${total}: ${current}\n`);
}

function reviewSummary(result, asked) {
  return asked ? ` AI reviewed ${result.reviewed} pages; ${result.reviewFailed.length} reviews failed.` : '';
}

async function main() {
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (positionals.length !== 1) throw new Error(usage);
  const aiReview = values['ai-review'] === true;
  const result = await onboardProject({ url: positionals[0], name: values.name, id: values.id, browserProfile: values.profile, aiReview }, progress);
  console.log(`${result.project}: scanned ${result.scanned} of ${result.pageCount} pages; ${result.failed.length} failed.${reviewSummary(result, aiReview)} Open it with npm start.`);
  for (const failure of [...result.failed, ...result.reviewFailed]) process.stderr.write(`${failure.page}: ${failure.error}\n`);
  if (result.failed.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
