import { agentBoard, agentCardDiff, createAgentCard, commentAgentCard } from './agent-board.mjs';

const project = { type: 'string', description: 'Registered project ID.' };
const card = { type: 'string', description: 'Request card ID in this project.' };
const text = { type: 'string' };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

// These operations keep requests separate from task/page QA acceptance. A send is explicit.
export const agentBoardTools = [
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
    run: ({ project: projectId, ...input }) => createAgentCard(projectId, input),
  },
  {
    name: 'dogfood_agent_comment',
    description: 'Add a note or explicitly send feedback to the request native session. send:true can start or resume the agent; requires user-authorized delegation. Sending during a run queues the feedback for the next turn.',
    inputSchema: schema({ project, card, text, send: { type: 'boolean' } }, ['project', 'card', 'text', 'send']),
    run: input => commentAgentCard(input.project, input.card, { text: input.text, send: input.send }),
  },
];
