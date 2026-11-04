// Delivery is derived from the plan and independently recorded evidence, never a model's summary.
export function requestTaskActor(card) { return `request:${card.id}`; }
export function linkedBuild(card) { return Boolean(card.taskId) && (card.intent || 'build') === 'build'; }
const waitingDependencies = task => task.dependencies.filter(item => !item.accepted);
function taskAvailability(task) {
  if (task.status === 'accepted') return 'This task was already accepted. Create a new task for additional work.';
  if (task.status === 'blocked') return task.blocker || 'Unblock the linked task before starting.';
  return ['todo', 'doing'].includes(task.status) ? '' : 'The linked task is unavailable. Review the plan.';
}
function taskConflict(task, owner) {
  const waiting = waitingDependencies(task);
  if (waiting.length) return `Finish dependencies first: ${waiting.map(item => item.title).join(', ')}.`;
  return task.owner && task.owner !== owner ? `Task is owned by ${task.owner}. Release or recover that claim in Plan before starting another agent.` : '';
}
export function taskLaunch(task, card) {
  if (!linkedBuild(card)) return { allowed: true, reason: '', owner: null };
  const owner = requestTaskActor(card);
  const reason = task ? taskAvailability(task) || taskConflict(task, owner) : 'The linked task no longer exists. Review the plan.';
  return { allowed: !reason, reason, owner };
}

function state(value, label, summary, kind, action) { return { state: value, label, summary, nextAction: { kind, label: action } }; }
function unlinkedDisposition(card) {
  if (card.intent === 'qa') return state('unlinked', 'Page review', 'This audit records page evidence and findings. Review the page acceptance requirements separately from the agent conversation.', card.pageId ? 'open-page' : 'open-plan', card.pageId ? 'Review page evidence' : 'Review QA scope');
  if (card.intent === 'discovery') return state('unlinked', 'Scope review', 'Review the proposed scope and decisions before starting implementation.', 'open-plan', 'Review the plan');
  return state('unlinked', 'Task not linked', 'This conversation has no linked task. Its completion does not prove a verified outcome.', 'open-plan', 'Define a task');
}
const sourceSaved = card => Boolean(card.integration?.sourceSaved) && card.integration.turn === card.turn;
const finishedWithoutChanges = card => ['review', 'done'].includes(card.status) && card.turn > 0 && Array.isArray(card.changedFiles) && !card.changedFiles.length;
function needsSourceReview(card) { return Boolean(card.changedFiles?.length) && !sourceSaved(card); }
function attentionSummary(card) { return card.error || card.outcome?.decision || card.summary || 'Review the agent question or setup problem.'; }
function attentionDisposition(card) {
  const question = card.outcome?.decision;
  return state('blocked', 'Needs attention', attentionSummary(card), question ? 'answer' : 'open-plan', question ? 'Answer agent' : 'Review blocker');
}
function pageDisposition(task) {
  const unchecked = task.pages.filter(page => !page.accepted);
  return state('verify', 'Page QA required', `${unchecked.length} linked ${unchecked.length === 1 ? 'page still needs' : 'pages still need'} acceptance.`, 'open-plan', 'Review page requirements');
}
const deliveryRules = [
  [({ task }) => task.accepted, ({ task }) => state('accepted', 'Verified', acceptedSummary(task), 'none', 'Verified')],
  [({ task }) => task.status === 'accepted', () => state('recheck', 'Recheck required', 'Previously accepted evidence no longer satisfies the current source and page requirements. Reopen verification to check it again; earlier evidence stays in history.', 'reopen-task', 'Reopen for verification')],
  [({ card }) => card.execution?.label, ({ card }) => state('building', card.execution.label, card.execution.detail, 'none', 'Wait for session confirmation')],
  [({ card }) => card.status === 'running' || card.starting, () => state('building', 'Agent working', 'The agent is working. Its result must still be reviewed and verified.', 'none', 'Wait for the result')],
  [({ card }) => card.status === 'attention', ({ card }) => attentionDisposition(card)],
  [({ launch }) => !launch.allowed, ({ launch }) => state('blocked', 'Blocked', launch.reason, 'open-plan', 'Review task')],
  [({ card }) => card.integration && !card.integration.sourceSaved, () => state('review', 'Save reviewed changes', 'The reviewed changes are staged. Save them before running source checks.', 'save-source', 'Save reviewed changes')],
  [({ card }) => needsSourceReview(card), () => state('review', 'Review changes', 'Inspect and apply the agent changes before verifying the project source.', 'inspect', 'Inspect changes')],
  [({ card }) => !['review', 'done'].includes(card.status), ({ card, task }) => state('planned', card.queued ? 'Queued' : 'Ready to start', task.outcome, card.queued ? 'none' : 'start', card.queued ? 'Waiting for an agent slot' : 'Start agent')],
  [({ task }) => !task.checks.verified, ({ task }) => state('verify', task.receipt ? 'Verify again' : 'Verify the result', 'Run the task checks against the current project source. Agent-reported checks do not replace this receipt.', 'verify-task', 'Run task checks')],
  [({ task }) => task.pages.some(page => !page.accepted), ({ task }) => pageDisposition(task)],
];
function acceptedSummary(task) { return task.pages.length ? 'Task checks and every linked page pass on the current source.' : 'Task checks pass on current source; no page QA was required for this task.'; }
function disposition(card, task, launch) {
  if (!task) return unlinkedDisposition(card);
  const input = { card, task, launch };
  const rule = deliveryRules.find(([matches]) => matches(input));
  return rule ? rule[1](input) : state('ready', 'Ready to accept', 'Current source checks and page requirements pass. Accept the task to record the verified outcome.', 'accept-task', 'Accept verified task');
}
function sourceRequirement(card) {
  const saved = sourceSaved(card), unchanged = finishedWithoutChanges(card);
  return { id: 'source', label: 'Reviewed source', status: saved || unchanged ? 'pass' : 'pending', detail: saved ? 'Reviewed changes saved to the project' : unchanged ? 'Finished worktree has no changes to apply' : 'Inspect the result before verifying source' };
}
function checkStatus(task) {
  if (task.checks.verified) return 'pass';
  return task.receipt?.current && !task.receipt.passed ? 'failed' : 'pending';
}
function checkDetail(task) {
  const checks = task.checks;
  if (checks.verified) return `${checks.passed} of ${checks.total} passed on current source`;
  return task.receipt && !checks.current ? 'Source or task changed; rerun checks' : `${checks.total} checks required`;
}
function groupRequirement(id, label, items, noun, empty) {
  const accepted = items.filter(item => item.accepted).length;
  return { id, label, status: groupStatus(items, accepted), detail: items.length ? `${accepted} of ${items.length} ${noun} accepted` : empty };
}
function groupStatus(items, accepted) { return items.length ? accepted === items.length ? 'pass' : 'pending' : 'not_required'; }
function requirements(card, task) {
  if (!task) return [];
  return [
    groupRequirement('dependencies', 'Dependencies', task.dependencies, 'dependencies', 'No dependencies'),
    sourceRequirement(card),
    { id: 'checks', label: 'Task checks', status: checkStatus(task), detail: checkDetail(task) },
    groupRequirement('pages', 'Page QA', task.pages, 'pages', 'No page requirements'),
    { id: 'acceptance', label: 'Task acceptance', status: task.accepted ? 'pass' : 'pending', detail: task.accepted ? 'Current evidence accepted' : 'Not accepted with current evidence' },
  ];
}
function briefTask(task) { return task ? { id: task.id, title: task.title, outcome: task.outcome, priority: task.priority, status: task.status, owner: task.owner } : null; }
function taskCollections(task) {
  if (!task) return { checks: { total: 0, passed: 0, current: false, verified: false, verifiedAt: null }, pages: [], dependencies: [] };
  return { checks: task.checks, pages: task.pages, dependencies: task.dependencies };
}
export function cardDelivery(card, tasks) {
  const task = linkedBuild(card) ? tasks.find(item => item.id === card.taskId) || null : null;
  const launch = taskLaunch(task, card);
  return { ...disposition(card, task, launch), task: briefTask(task), ...taskCollections(task), requirements: requirements(card, task), launch };
}
function readyTask(task, activeTasks) { return task.status === 'todo' && !task.owner && task.dependencies.every(item => item.accepted) && !activeTasks.has(task.id); }
function readyBrief(task) { return { id: task.id, title: task.title, outcome: task.outcome, priority: task.priority, pageIds: task.pageIds, checks: task.checks, look: task.look }; }
export function boardDelivery(cards, tasks) {
  const activeTasks = new Set(cards.filter(card => linkedBuild(card) && card.status !== 'done').map(card => card.taskId));
  return {
    deliverySummary: {
      linked: cards.filter(card => card.delivery.task).length,
      accepted: cards.filter(card => card.delivery.state === 'accepted').length,
      needsVerification: cards.filter(card => ['verify', 'ready', 'recheck'].includes(card.delivery.state)).length,
      blocked: cards.filter(card => card.delivery.state === 'blocked').length,
      unlinked: cards.filter(card => !card.delivery.task).length,
    },
    readyTasks: tasks.filter(task => readyTask(task, activeTasks)).toSorted((a, b) => a.priority - b.priority).map(readyBrief),
  };
}
