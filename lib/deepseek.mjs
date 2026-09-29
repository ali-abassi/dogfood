import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './paths.mjs';

// The AI check and competitor summaries both call DeepSeek directly (deepseek-flash reads images and returns JSON).
// API: https://api-docs.deepseek.com/api/create-chat-completion
export const model = 'deepseek-flash';
const endpoint = 'https://api.deepseek.com/chat/completions';
// USD per million tokens for deepseek-flash, from https://api-docs.deepseek.com/quick_start/pricing (as read 2026-09-10).
const prices = { peak: { cacheHit: 0.006, cacheMiss: 0.3, output: 1.2 }, offPeak: { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 } };
// Peak pricing runs 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
const peakHours = new Set([1, 2, 3, 6, 7, 8, 9]);

// DEEPSEEK_API_KEY where dogfood runs, else the git-ignored .env at dogfood's root.
function deepSeekKey() {
  const file = join(root, '.env');
  if (!process.env.DEEPSEEK_API_KEY && existsSync(file)) process.loadEnvFile(file);
  return process.env.DEEPSEEK_API_KEY?.trim() ?? '';
}

function rateAt(date) {
  const weekday = date.getUTCDay() >= 1 && date.getUTCDay() <= 5;
  return weekday && peakHours.has(date.getUTCHours()) ? prices.peak : prices.offPeak;
}

const count = value => (Number.isInteger(value) ? value : 0);

// DeepSeek reports tokens, not cost; the cost is worked out from its published prices at the time of the call.
export function usageReceipt(usage, at = new Date()) {
  const promptTokens = count(usage?.prompt_tokens);
  const cachedTokens = count(usage?.prompt_cache_hit_tokens);
  const completionTokens = count(usage?.completion_tokens);
  const rate = rateAt(at);
  const costUsd = (cachedTokens * rate.cacheHit + (promptTokens - cachedTokens) * rate.cacheMiss + completionTokens * rate.output) / 1_000_000;
  return { promptTokens, cachedTokens, completionTokens, costUsd: Math.round(costUsd * 1_000_000) / 1_000_000 };
}

// A response cut short would otherwise surface as a cryptic JSON parse error.
const unfinished = {
  length: 'The AI’s answer was cut off before it finished. Try again.',
  insufficient_system_resource: 'The AI provider ran out of capacity partway through. Try again.',
};

export function finishedContent(choice) {
  const reason = unfinished[choice?.finish_reason];
  if (reason) throw new Error(reason);
  return choice?.message?.content;
}

// One JSON reply for one user message; the message itself must describe the JSON it wants (DeepSeek's JSON mode).
export async function callModel({ content, maxTokens }, purpose) {
  const key = deepSeekKey();
  if (!key) throw new Error(`The ${purpose} needs a DeepSeek key. Set DEEPSEEK_API_KEY in dogfood’s .env, then try again.`);
  const response = await fetch(endpoint, {
    method: 'POST', signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, messages: [{ role: 'user', content }] }),
  });
  const result = await response.json();
  if (response.ok) return result;
  throw Object.assign(new Error(`DeepSeek ${response.status}: ${result.error?.message || `${purpose} failed`}`), { providerResponse: result });
}
