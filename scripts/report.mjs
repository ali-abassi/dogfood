import { projectReport } from '../lib/report.mjs';

const [projectId] = process.argv.slice(2);
if (!projectId) {
  process.stderr.write('Usage: npm run report -- <project> [> report.md]\n');
  process.exitCode = 1;
} else {
  process.stdout.write(projectReport(projectId));
}
