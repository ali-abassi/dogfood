// Native output is an opinion until an independent check or page verdict proves it.
const limit = (value, size = 280) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, size);
const preparation = /^(?:i(?:['’]ll| will)|now i(?:['’]ll| will)|let me|first[,:]? i|checking|reading|reviewing|running|toolsearch)\b/i;

function packet(reply) {
  const matches = [...reply.matchAll(/```dogfood-result\s*\n([\s\S]*?)\n```/gi)];
  return matches.map(match => parsedPacket(match[1])).filter(validPacket).at(-1) || null;
}
function parsedPacket(text) { try { return JSON.parse(text); } catch { return null; } }

function plain(line) { return line.replace(/^\s*(?:#+\s*|[-*]\s*)/, '').replace(/[*`]/g, '').trim(); }
function useful(line) { return line.length > 8 && !preparation.test(line) && !/^\d+[.)]?\s+(?:what|how|open|verification)/i.test(line); }
function textSummary(reply) {
  const lines = reply.replace(/```dogfood-result[\s\S]*?```/gi, '').split(/\n+/).map(plain).filter(useful);
  return limit(lines[0] || 'Agent turn finished. Inspect its result and evidence.');
}

function preview(value) {
  try {
    const url = new URL(value);
    return localPreview(url) ? url.href : null;
  } catch { return null; }
}
function localPreview(url) { return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password; }

function items(value) { return Array.isArray(value) ? value.slice(0, 20) : []; }
function check(item) {
  return { command: limit(item?.command, 1200), result: limit(item?.result, 2000), evidence: limit(item?.evidence, 1000), provenance: 'agent-reported' };
}
function legacyDecision(reply) {
  const match = reply.match(/(?:^|\n)\s*(?:\*\*)?NEEDS_INPUT:(?:\*\*)?\s*([^\n]+)/i);
  return match ? limit(match[1], 2000) : '';
}

function validPacket(value) {
  if (!value) return false;
  return ['ready_for_review', 'needs_input'].includes(value.status) && typeof value.summary === 'string' && Boolean(value.summary.trim()) && validDecision(value);
}
function validDecision(value) { return value.status !== 'needs_input' || (typeof value.decision === 'string' && Boolean(value.decision.trim())); }

export function agentOutcome(reply = '') {
  const value = packet(reply), decision = legacyDecision(reply);
  if (!validPacket(value)) return legacyOutcome(reply, decision);
  const question = value.status === 'needs_input' ? limit(value.decision, 2000) : decision;
  return { status: question ? 'needs_input' : value.status, summary: limit(value.summary), decision: question, checks: items(value.checks).map(check), previewUrl: preview(value.previewUrl), unverified: items(value.unverified).map(item => limit(item, 1000)), provenance: 'agent-reported', structured: true };
}
function legacyOutcome(reply, decision) {
  return { status: decision ? 'needs_input' : 'ready_for_review', summary: decision || textSummary(reply), decision, checks: [], previewUrl: null, unverified: [], provenance: 'agent-reported', structured: false };
}

export function requestSummary(card) {
  if (card.error) return limit(card.error);
  if (card.status === 'running' || card.queued) return activeSummary(card);
  if (card.result) return agentOutcome(card.result).summary;
  return limit(card.request);
}
function activeSummary(card) {
  const entry = card.comments?.findLast(item => item.by === 'person' && item.sent && !item.discardedAt);
  return limit(entry?.text || card.request);
}
