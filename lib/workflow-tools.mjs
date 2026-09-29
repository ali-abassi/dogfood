import { initProject, attachProjectUrl } from './project-init.mjs';
import { workflow, addTask, claimTask, updateTask, verifyTask, acceptTask, context } from './tasks.mjs';
import { pageById, projectView, readProject } from './store.mjs';

const string = { type: 'string' };
const strings = { type: 'array', items: string };
const schema = (properties, required) => ({ type: 'object', properties, required });
const project = { ...string, description: 'Registered project ID.' };
const agent = { ...string, description: 'Your stable agent name; used for ownership and attribution.' };
const task = { ...string, description: 'Stable task ID.' };
const checks = { type: 'array', items: schema({ id: string, command: strings }, ['id', 'command']) };
const taskProperties = { id: string, title: string, outcome: string, scope: strings, dependencies: strings, pageIds: strings, priority: { type: 'integer', minimum: 0, maximum: 3 }, checks, look: string, handoff: string };
const taskInput = schema(taskProperties, ['title', 'outcome', 'checks']);
const identity = { project, task, agent };

function taskTool(name, description, operation) {
  return { name, description, inputSchema: schema(identity, ['project', 'task', 'agent']), run: input => operation(input.project, input.task, input.agent) };
}

function acceptedPage(input) {
  const page = pageById(projectView(readProject(input.project)), input.page);
  if (!page.progress.accepted) throw new Error(`Page ${input.page} is not accepted:\n${page.progress.acceptanceRequirements.filter(item => !item.met).map(item => `- ${item.id}: ${item.missing}`).join('\n')}`);
  return { page: page.id, accepted: true };
}

export const workflowTools = [
  { name: 'dogfood_init', description: 'Initialize a project from its local checkout before a website exists. Idempotent for the same ID and checkout. Optional URL can be attached now or later.', inputSchema: schema({ id: string, name: string, checkout: string, url: string, environment: string, description: string }, ['checkout']), run: input => { const project = initProject(input); return { project: project.id, name: project.name, source: project.source }; } },
  { name: 'dogfood_attach_url', description: 'Attach the running app URL to an existing checkout-first project without replacing its plan, tasks, or page evidence.', inputSchema: schema({ project, url: string }, ['project', 'url']), run: input => { const project = attachProjectUrl(input.project, input.url); return { project: project.id, source: project.source }; } },
  { name: 'dogfood_context', description: 'Get a compact project handoff for a fresh agent: current work, next unblocked task, blockers, docs, and verification/acceptance steps. Start here to resume work.', inputSchema: schema({ project }, ['project']), run: input => context(input.project) },
  { name: 'dogfood_tasks', description: 'Read the structured plan, task ownership, dependencies, verification receipts, blockers, and next available task.', inputSchema: schema({ project }, ['project']), run: input => workflow(input.project) },
  { name: 'dogfood_next_task', description: 'Return the highest-priority task with accepted dependencies and no owner, together with a compact project handoff. This is build work; dogfood_next lists page QA gaps.', inputSchema: schema({ project }, ['project']), run: input => context(input.project) },
  { name: 'dogfood_add_task', description: 'Add a scoped outcome to the plan with dependencies, explicit native check argv arrays, and optional related pages and visual acceptance criteria. No commands run until verification.', inputSchema: schema({ project, agent, input: taskInput }, ['project', 'agent', 'input']), run: input => addTask(input.project, input.input, input.agent) },
  { name: 'dogfood_update_task', description: 'Update your task plan, record a blocking reason or handoff, or release ownership. Material plan changes invalidate earlier verification. Another owner cannot be overwritten.', inputSchema: schema({ ...identity, input: schema({ ...taskProperties, status: { type: 'string', enum: ['todo', 'doing', 'blocked'] }, blocker: string, releaseOwner: { type: 'boolean' } }, []) }, ['project', 'task', 'agent', 'input']), run: input => updateTask(input.project, input.task, input.input, input.agent) },
  taskTool('dogfood_claim_task', 'Atomically claim an unowned, unblocked task. A competing agent cannot claim the same task; repeated claims by its owner are safe.', claimTask),
  taskTool('dogfood_verify_task', 'Execute the claimed task’s explicitly configured native check commands in its checkout and save bounded receipts tied to the plan and source fingerprint. Does not scan pages or spend model usage.', verifyTask),
  taskTool('dogfood_accept_task', 'Accept your verified task only when its receipt still matches the plan and checkout, dependencies are accepted, and related pages pass the acceptance gate.', acceptTask),
  { name: 'dogfood_accept_page', description: 'Check page acceptance: complete coverage, current evidence, all six answers good and no unresolved findings. Audit completion alone does not imply acceptance.', inputSchema: schema({ project, page: string }, ['project', 'page']), run: acceptedPage },
];
