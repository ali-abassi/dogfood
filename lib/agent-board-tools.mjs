import {
  agentBoard, agentCardDiff, createAgentCard, commentAgentCard, dispatchAgentBoard,
  runAgentCard, stopAgentCard, completeAgentCard, reopenAgentCard, discardAgentFeedback,
} from './agent-board.mjs';

const project = { type: 'string', description: 'Registered project ID.' };
const card = { type: 'string', description: 'Request card ID in this project.' };
const text = { type: 'string' };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const actions = { run: runAgentCard, stop: stopAgentCard, complete: completeAgentCard, reopen: reopenAgentCard, 'discard-feedback': discardAgentFeedback };

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
  return dispatchedCard(input.project, operation(input.project, input.card), ['run', 'stop'].includes(input.action));
}

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
      pageId: text, featureId: text, taskId: text,
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
    description: 'Run, stop, complete, reopen or discard queued feedback on one agent request. run starts/resumes native work and requires user-authorized delegation. Complete never accepts QA, merges or deploys. Discard keeps comment history. Keep the Dogfood web server running to reconcile results and queued feedback.',
    inputSchema: schema({ project, card, action: { type: 'string', enum: Object.keys(actions) } }, ['project', 'card', 'action']),
    run: act,
  },
];
