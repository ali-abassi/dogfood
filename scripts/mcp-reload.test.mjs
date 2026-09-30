import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';

function client(directory) {
  const child = spawn(process.execPath, ['mcp.mjs'], { cwd: directory, env: { ...process.env, DOGFOOD_DATA: join(directory, 'isolated-data') }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  const notifications = [];
  let nextId = 0;
  const input = createInterface({ input: child.stdout });
  input.on('line', line => {
    const message = JSON.parse(line);
    if (Object.hasOwn(message, 'id')) waiting.get(message.id)?.(message);
    else notifications.push(message);
  });
  child.stderr.resume();
  return {
    child, notifications,
    notify: method => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`),
    request(method, params) {
      const id = ++nextId;
      return new Promise(resolve => {
        waiting.set(id, result => { waiting.delete(id); resolve(result); });
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    },
  };
}

async function until(condition) {
  const deadline = Date.now() + 8000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for tools/list_changed');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function textResult(response) { return JSON.parse(response.result.content[0].text); }

test('persistent MCP connection reloads added tools and transitive implementations without restart', { timeout: 20_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dogfood-mcp-reload-'));
  for (const path of ['mcp.mjs', 'package.json', 'lib']) cpSync(path, join(directory, path), { recursive: true });
  const entry = join(directory, 'mcp.mjs');
  const source = readFileSync(entry, 'utf8');
  const peer = client(directory);
  try {
    const initialized = await peer.request('initialize', { protocolVersion: '2025-11-25' });
    assert.equal(initialized.result.capabilities.tools.listChanged, true);
    peer.notify('notifications/initialized');
    const oldList = await peer.request('tools/list');
    assert.ok(oldList.result.tools.some(tool => tool.name === 'dogfood_retire_feature'));
    writeFileSync(join(directory, 'lib/reload-probe.mjs'), 'export const version = 1;\n');
    const next = source.replace("import './lib/env.mjs';", "import './lib/env.mjs';\nimport { version } from './lib/reload-probe.mjs';").replace('const definitions = [', "const definitions = [\n { name: 'dogfood_reload_probe', description: 'Isolated reload proof', inputSchema: { type: 'object', required: [] }, run: () => ({ version }) },");
    writeFileSync(entry, next);
    await until(() => peer.notifications.some(item => item.method === 'notifications/tools/list_changed'));
    const currentList = await peer.request('tools/list');
    assert.ok(currentList.result.tools.some(tool => tool.name === 'dogfood_reload_probe'));
    assert.equal(textResult(await peer.request('tools/call', { name: 'dogfood_reload_probe' })).version, 1);
    writeFileSync(join(directory, 'lib/reload-probe.mjs'), 'export const version = 2;\n');
    assert.equal(textResult(await peer.request('tools/call', { name: 'dogfood_reload_probe' })).version, 2);
    writeFileSync(join(directory, 'lib/reload-probe.mjs'), 'invalid syntax !\n');
    assert.equal((await peer.request('tools/call', { name: 'dogfood_reload_probe' })).error.code, -32603);
    writeFileSync(join(directory, 'lib/reload-probe.mjs'), 'export const version = 3;\n');
    assert.equal(textResult(await peer.request('tools/call', { name: 'dogfood_reload_probe' })).version, 3);
    assert.equal(peer.child.exitCode, null, 'The protocol server stayed alive');
  } finally {
    peer.child.kill();
    await new Promise(resolve => peer.child.once('exit', resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
