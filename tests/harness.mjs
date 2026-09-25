// Shared plumbing for the browser acceptance suites: a dogfood server on a free port with its own
// data folder, a named agent-browser session, numbered checks, and an optional video of the run.
// Set DOGFOOD_RECORD_DIR to record each suite's browser session to <dir>/<suite>.webm as proof.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = fileURLToPath(new URL('..', import.meta.url));

async function freePort() {
  return new Promise(done => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
  });
}

export async function startServer(dataDir) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: dataDir }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) return { url, stop: () => child.kill() }; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  child.kill();
  throw new Error(`dogfood did not start on ${url}`);
}

export function browserSession(name) {
  const session = `${name}-${process.pid}`;
  const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
  // Runs an expression in the page and returns its JSON value.
  const evaluate = expression => {
    const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
    return typeof value === 'string' ? JSON.parse(value) : value;
  };
  return { browser, evaluate };
}

// Starts a video of the session when DOGFOOD_RECORD_DIR is set; returns the function that stops it.
export function recordRun(browser, suite) {
  const directory = process.env.DOGFOOD_RECORD_DIR;
  if (!directory) return () => {};
  mkdirSync(resolve(directory), { recursive: true });
  browser('record', 'start', resolve(directory, `${suite}.webm`), '--fps', '10', '--cursor');
  return () => browser('record', 'stop');
}

export function checker() {
  let passed = 0;
  const check = async (name, body) => {
    await body();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  };
  return { check, passed: () => passed };
}
