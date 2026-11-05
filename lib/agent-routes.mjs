const routes = {
  codex: { environment: 'DOGFOOD_CODEX_ROUTE', default: 'gpt6.1-terra-xhigh', allowed: ['gpt6.1-terra-xhigh', 'gpt6-luna-xhigh'] },
  claude: { environment: 'DOGFOOD_CLAUDE_ROUTE', default: 'sonnet-5.5-high', allowed: ['sonnet-5.5-high'] },
};
export function agentRoute(backend) {
  const config = routes[backend];
  if (!config) throw new Error('Choose Codex or Claude Code.');
  const route = process.env[config.environment] || config.default;
  if (!config.allowed.includes(route)) throw new Error(`${config.environment} must be one of: ${config.allowed.join(', ')}. Check pal routes and quota before starting.`);
  return route;
}
