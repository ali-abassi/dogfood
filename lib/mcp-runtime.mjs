import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../mcp.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../', import.meta.url));

// One short-lived worker per request loads the complete module graph afresh.
// Requests travel over stdin, so arguments never appear in the process list.
export function freshToolRequest(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd: repository, env: { ...process.env, DOGFOOD_MCP_DIRECT: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 20_000_000) child.kill();
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Could not start the current tool implementation.')));
    child.on('close', code => {
      if (code !== 0) return reject(new Error('The current tool implementation failed to load.'));
      try { resolve(JSON.parse(output)); }
      catch { reject(new Error('The current tool implementation returned an invalid response.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

// Keep the protocol connection open while code changes. Notify only after a
// fresh worker has successfully loaded a changed tool schema.
export function watchToolList(initialTools, notify) {
  let signature = JSON.stringify(initialTools);
  let timer;
  let closed = false;
  let refreshing = Promise.resolve();
  async function refresh() {
    if (closed) return;
    const response = await freshToolRequest({ jsonrpc: '2.0', id: 'reload', method: 'tools/list' });
    const next = JSON.stringify(response.result.tools);
    if (closed || next === signature) return;
    signature = next;
    notify();
  }
  function changed(event, filename) {
    if (!filename || !/\.mjs$|^package\.json$/.test(String(filename))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      refreshing = refreshing.then(refresh).catch(() => {
        process.stderr.write('Dogfood tools could not reload; fix the source and save again.\n');
      });
    }, 200);
    timer.unref();
  }
  const watchers = [repository, `${repository}lib`].map(directory => watch(directory, changed));
  watchers.forEach(watcher => watcher.unref());
  return () => {
    closed = true;
    clearTimeout(timer);
    watchers.forEach(watcher => watcher.close());
  };
}
