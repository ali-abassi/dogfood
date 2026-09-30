#!/usr/bin/env node
import '../lib/env.mjs';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { doctor } from '../lib/doctor.mjs';
import { projectFromCheckout } from '../lib/project-init.mjs';
import { root } from '../lib/paths.mjs';
import { pageById, projectView, readProject } from '../lib/store.mjs';
import { pagesGate } from '../lib/completion.mjs';
import { runNamedTool, toolDefinitions } from '../mcp.mjs';

const help = `dogfood — plan, build, verify, and resume a web project

  dogfood init --checkout . [--id my-app] [--name "My App"] [--url URL]
  dogfood doctor [--project ID]
  dogfood context [--project ID] --json
  dogfood next [--project ID] --json
  dogfood task list [--project ID]
  dogfood task add --input task.json --agent NAME
  dogfood task claim TASK --agent NAME
  dogfood task update TASK --input changes.json --agent NAME
  dogfood verify TASK --agent NAME
  dogfood task accept TASK --agent NAME
  dogfood attach-url URL [--project ID]
  dogfood gate [PAGE ...] [--accept] [--verbose] [--project ID]
  dogfood scan [PAGE] [--live-url URL] [--browser-profile Default] [--required-role ROLE] [--fixtures NAME]
  dogfood accept-measured PAGE --agent NAME
  dogfood deployed --url URL [--revision SHA] --agent NAME
  dogfood report [--project ID]
  dogfood tool TOOL --input args.json
  dogfood schema [TOOL]
  dogfood skill

Project defaults to the current checkout or DOGFOOD_PROJECT.
--input - reads JSON from stdin. --json prints compact JSON.
Checks are explicit argv arrays: ["npm","test"], never parsed as shell.
Audit completion and acceptance are separate. gate --accept requires acceptance.
`;

const options = Object.fromEntries(['project', 'input', 'checkout', 'id', 'name', 'url', 'environment', 'agent', 'revision', 'live-url', 'browser-profile', 'required-role'].map(name => [name, { type: 'string' }]));
Object.assign(options, { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, accept: { type: 'boolean' }, 'serves-checkout': { type: 'boolean' }, verbose: { type: 'boolean' }, fixtures: { type: 'string', multiple: true } });

function inputJson(values) {
  if (!values.input) throw new Error('Provide --input FILE, or --input - for JSON from stdin.');
  const content = readFileSync(values.input === '-' ? 0 : resolve(values.input), 'utf8');
  if (content.length > 100_000) throw new Error('Input is too large.');
  const input = JSON.parse(content);
  assertInputObject(input);
  return input;
}

function assertInputObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be a JSON object.');
}

function projectId(values) {
  const id = values.project ?? process.env.DOGFOOD_PROJECT ?? projectFromCheckout();
  if (!id) throw new Error('No project for this checkout. Run dogfood init or provide --project ID.');
  return id;
}

function actor(values) {
  const agent = values.agent ?? process.env.DOGFOOD_AGENT;
  if (!agent) throw new Error('Provide --agent NAME for task ownership and attribution.');
  return agent;
}

function initialized(project) {
  return { ...project, skill: `${root}/skills/dogfood/SKILL.md`, nextStep: `Read the skill, then run dogfood context --project ${project.project} --json.` };
}

async function taskCommand([action, task], values) {
  const project = projectId(values);
  if (action === 'list') return runNamedTool('dogfood_tasks', { project });
  if (action === 'add') return runNamedTool('dogfood_add_task', { project, agent: actor(values), input: inputJson(values) });
  const operations = { claim: 'dogfood_claim_task', update: 'dogfood_update_task', verify: 'dogfood_verify_task', accept: 'dogfood_accept_task' };
  if (!operations[action]) throw new Error('Task action must be list, add, claim, update, verify, or accept.');
  const args = { project, task, agent: actor(values) };
  if (action === 'update') args.input = inputJson(values);
  return runNamedTool(operations[action], args);
}

function scanOptions(values) {
  const pairs = [['liveUrl', 'live-url'], ['browserProfile', 'browser-profile'], ['requiredRole', 'required-role']];
  const selected = Object.fromEntries(pairs.filter(([, flag]) => values[flag] !== undefined).map(([key, flag]) => [key, values[flag]]));
  if (values.fixtures) selected.fixtures = values.fixtures.flatMap(value => value.split(','));
  return selected;
}

function gateMode(values) { return values.accept ? 'acceptance' : 'audit'; }

function gate(pageIds, values) {
  const project = projectView(readProject(projectId(values)));
  const pages = pageIds.length ? pageIds.map(id => pageById(project, id)) : project.pages;
  const result = pagesGate(pages, gateMode(values), { verbose: values.verbose });
  if (!pages.length) result.lines = ['This project has no pages. Register pages once the app runs; use task acceptance for work before a UI exists.'];
  if (!result.complete) process.exitCode = 1;
  return { project: project.id, mode: gateMode(values), ...result };
}

function schema(name) {
  const tools = toolDefinitions();
  if (!name) return tools.map(({ name, description }) => ({ name, description }));
  const tool = tools.find(tool => tool.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}.`);
  return tool;
}

const commands = {
  init: async (args, values) => initialized(await runNamedTool('dogfood_init', { ...values, servesCheckout: values['serves-checkout'], checkout: resolve(values.checkout ?? '.') })),
  doctor: (args, values) => doctor(values.project ?? projectFromCheckout()),
  context: (args, values) => runNamedTool('dogfood_context', { project: projectId(values) }),
  next: (args, values) => runNamedTool('dogfood_next_task', { project: projectId(values) }),
  task: taskCommand,
  verify: (args, values) => taskCommand(['verify', ...args], values),
  'attach-url': (args, values) => runNamedTool('dogfood_attach_url', { project: projectId(values), url: args[0] ?? values.url, servesCheckout: values['serves-checkout'] }),
  gate,
  scan: (args, values) => runNamedTool(args.length ? 'dogfood_scan_page' : 'dogfood_scan_project', { project: projectId(values), ...(args.length ? { page: args[0] } : {}), ...scanOptions(values) }),
  'accept-measured': (args, values) => runNamedTool('dogfood_accept_measured', { project: projectId(values), page: args[0], agent: actor(values) }),
  deployed: (args, values) => runNamedTool('dogfood_record_deployment', { project: projectId(values), agent: actor(values), input: { url: values.url ?? args[0], revision: values.revision } }),
  report: (args, values) => runNamedTool('dogfood_report', { project: projectId(values) }),
  tool: (args, values) => runNamedTool(args[0], inputJson(values)),
  schema: args => schema(args[0]),
  skill: () => ({ path: `${root}/skills/dogfood/SKILL.md`, text: readFileSync(`${root}/skills/dogfood/SKILL.md`, 'utf8') }),
};

function failedResult(result) {
  if (!result) return false;
  return [result.passed, result.ok, result.receipt?.passed].includes(false);
}

function printResult(result, compact) {
  if (failedResult(result)) process.exitCode = 1;
  const output = typeof result === 'string' && !compact ? result : JSON.stringify(result, null, compact ? 0 : 2);
  process.stdout.write(`${output}\n`);
}

function helpRequested(command, values) {
  return values.help || !command || command === 'help';
}

async function main() {
  const { values, positionals: [command, ...args] } = parseArgs({ options, allowPositionals: true });
  if (helpRequested(command, values)) return process.stdout.write(help);
  const run = commands[command];
  if (!run) throw new Error(`Unknown command: ${command}. Run dogfood --help.`);
  const result = await run(args, values);
  if (command === 'gate' && !values.json) return process.stdout.write(`${result.lines.join('\n')}\n`);
  printResult(result, values.json);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
