import {
  agentBoard, agentCardDiff, createAgentCard, commentAgentCard, dispatchAgentBoard,
  runAgentCard, stopAgentCard, completeAgentCard, reopenAgentCard, discardAgentFeedback, integrateAgentCard, saveAgentCardSource, releaseAgentCardIntegration, verifyAgentCardTask, acceptAgentCardTask, reopenAgentCardTask,
} from './agent-board.mjs';

const project = { type: 'string', description: 'Registered project ID.' };
const card = { type: 'string', description: 'Request card ID in this project.' };
const text = { type: 'string' };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const actions = { run: runAgentCard, stop: stopAgentCard, complete: completeAgentCard, reopen: reopenAgentCard, 'discard-feedback': discardAgentFeedback, integrate: integrateAgentCard, 'save-source': saveAgentCardSource, 'release-integration': releaseAgentCardIntegration, 'verify-task': verifyAgentCardTask, 'accept-task': acceptAgentCardTask, 'reopen-task': reopenAgentCardTask };

function requestCard(projectId, cardId) {
  const value = agentBoard(projectId).cards.find(item => item.id === cardId);
  if (!value) throw new Error('Request does not exist in this project.');
  return value;
}

async function dispatchedCard(projectId, value, dispatch) {
  if (dispatch) await dispatchAgentBoard(projectId);
  return requestCard(projectId, value.id);
}

async function request({ project: projectId, ...input }) {
  return dispatchedCard(projectId, createAgentCard(projectId, input), input.start === true);
}

async function addComment(input) {
  const value = commentAgentCard(input.project, input.card, { text: input.text, send: input.send });
  return dispatchedCard(input.project, value, input.send === true);
}

async function act(input) {
  const operation = actions[input.action];
  if (!operation) throw new Error('Unknown agent request action.');
  return dispatchedCard(input.project, await operation(input.project, input.card, sourceActionInput(input)), ['run', 'stop'].includes(input.action));
}
function sourceActionInput(input) { return ['save-source', 'release-integration'].includes(input.action) ? { integrationId: input.integrationId } : { fingerprint: input.fingerprint }; }

// These operations keep requests separate from task/page QA acceptance. A send is explicit.
export const agentBoardTools = [
  {
    name: 'dogfood_agent_card',
    description: 'Read one project request and its complete conversation, result, session and worktree. Does not start an agent.',
    inputSchema: schema({ project, card }, ['project', 'card']),
    run: input => requestCard(input.project, input.card),
  },
  {
    name: 'dogfood_agent_board',
    description: 'Read the project agent board: requests, conversations, native session state and results. Does not start an agent.',
    inputSchema: schema({ project }, ['project']),
    run: input => agentBoard(input.project),
  },
  {
    name: 'dogfood_agent_changes',
    description: 'Read the bounded changed-file summary for a request worktree. This is source evidence, not QA acceptance or deployment proof.',
    inputSchema: schema({ project, card }, ['project', 'card']),
    run: input => agentCardDiff(input.project, input.card),
  },
  {
    name: 'dogfood_agent_request',
    description: 'Create an agent request linked to optional page/feature/task context. Saves for later by default. start:true starts a native agent and requires explicit user authorization for delegation.',
    inputSchema: schema({
      project, title: text, request: text,
      backend: { type: 'string', enum: ['codex', 'claude'] },
      intent: { type: 'string', enum: ['build', 'discovery', 'qa'], description: 'Build by default; discovery asks scope questions, QA audits without changing application source.' },
      pageId: text, featureId: text, taskId: text,
      annotationId: { type: 'string', description: 'Optional UUID of the screenshot annotation that originated this request.' },
      start: { type: 'boolean', description: 'Explicitly start the native agent. Omit or false to save for later.' },
    }, ['project', 'title', 'request', 'backend']),
    run: request,
  },
  {
    name: 'dogfood_agent_comment',
    description: 'Add a note or explicitly send feedback to the request native session. send:true can start or resume the agent; requires user-authorized delegation. Sending during a run queues the feedback for the next turn.',
    inputSchema: schema({ project, card, text, send: { type: 'boolean' } }, ['project', 'card', 'text', 'send']),
    run: addComment,
  },
  {
    name: 'dogfood_agent_action',
    description: 'Run, stop, complete, reopen, discard feedback, integrate a reviewed snapshot, save-source or release-integration as explicit operator actions. integrate requires its fingerprint and clean matching-base source; it stages reviewed edits. save-source requires integrationId and saves exact reviewed staging locally or reconciles an exact external commit, then prepares the same request for continuation. release-integration requires integrationId and clean source; it archives the observed revision and clears only the active receipt without changing source. If source moved, start a fresh request before integrating. Recognized native request contexts are refused as an accidental-use guard; this trusted local app is not an OS sandbox. These actions do not deploy or accept QA. Complete only closes the request. verify-task explicitly runs the linked task checks on integrated project source; accept-task records acceptance only after source and page gates pass. reopen-task explicitly reopens stale accepted evidence for verification, retaining its history. These task actions require an idle linked build request and operator authority. Keep the web server running for queued feedback/results.',
    inputSchema: schema({ project, card, action: { type: 'string', enum: Object.keys(actions) }, fingerprint: { type: 'string', description: 'Exact reviewed change fingerprint; required for integrate.' }, integrationId: { type: 'string', description: 'Latest integration receipt ID; required for explicit operator save-source or release-integration.' } }, ['project', 'card', 'action']),
    run: act,
  },
];
