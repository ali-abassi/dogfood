import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
const scannerUrl = new URL('../lib/scanner.mjs', import.meta.url).href;
// The child process can resolve only this logging stub as agent-browser. No browser is controlled.
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dogfood-session-fixture-'));
  const executable = join(directory, 'agent-browser');
  writeFileSync(executable, `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';\nconst args=process.argv.slice(2);appendFileSync(process.env.DOGFOOD_SCANNER_TEST_LOG,JSON.stringify(args)+'\\n');process.stdout.write(JSON.stringify({success:true,data:{result:'fixture'}}));\n`);
  chmodSync(executable, 0o755);
  const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, DOGFOOD_DATA: directory, DOGFOOD_SCANNER_TEST_LOG: join(directory, 'commands.jsonl') };
  delete env.DOGFOOD_BROWSER_SESSION; delete env.DOGFOOD_BROWSER_STATE;
  return { directory, env };
}
function run(fixture, body) {
  const script = `import assert from 'node:assert/strict';import {withScanner} from ${JSON.stringify(scannerUrl)};${body}`;
  execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: fixture.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return readFileSync(fixture.env.DOGFOOD_SCANNER_TEST_LOG, 'utf8').trim().split('\n').map(JSON.parse);
}
function commands(calls) { return calls.filter(args => args[0] !== '--version'); }
function withFixture(action) {
  const value = fixture();
  try { action(value); }
  finally { rmSync(value.directory, { recursive: true, force: true }); }
}
test('configured scanner session is reused without state injection, tracking or closing', () => withFixture(value => {
  value.env.DOGFOOD_BROWSER_SESSION = 'owned-shared-fixture'; value.env.DOGFOOD_BROWSER_STATE = '/fixture/existing-state.json';
  const calls = run(value, `const before=process.listenerCount('SIGINT');await withScanner('Default',async browser=>{assert.equal(browser.session,'owned-shared-fixture');assert.equal(process.listenerCount('SIGINT'),before);await browser.command(['snapshot']);});assert.equal(process.listenerCount('SIGINT'),before);`);
  assert.deepEqual(commands(calls), [['--session', 'owned-shared-fixture', '--profile', 'Default', '--json', 'snapshot']]);
}));
test('configured scanner session is preserved when its action throws', () => withFixture(value => {
  value.env.DOGFOOD_BROWSER_SESSION = 'owned-shared-fixture';
  const calls = run(value, `const before=process.listenerCount('SIGTERM');await assert.rejects(withScanner('Default',async browser=>{await browser.command(['snapshot']);throw new Error('fixture failed');}),/fixture failed/);assert.equal(process.listenerCount('SIGTERM'),before);`);
  assert.equal(commands(calls).length, 1); assert.equal(commands(calls)[0].at(-1), 'snapshot');
}));
test('default scanner owns a temporary session and closes it after success', () => withFixture(value => {
  const calls = run(value, `const before=process.listenerCount('SIGINT');await withScanner('Default',async browser=>{assert.match(browser.session,/^dogfood-scan-[a-f0-9]{8}$/);assert.equal(process.listenerCount('SIGINT'),before+1);await browser.command(['snapshot']);});assert.equal(process.listenerCount('SIGINT'),before);`);
  const actual = commands(calls); assert.equal(actual.length, 2); assert.equal(actual[0][1], actual[1][1]);
  assert.equal(actual[0].at(-1), 'snapshot'); assert.equal(actual[1].at(-1), 'close');
}));
test('default scanner closes its owned session after failure and retains saved-state setup', () => withFixture(value => {
  value.env.DOGFOOD_BROWSER_STATE = '/fixture/owned-state.json';
  const calls = run(value, `const before=process.listenerCount('SIGTERM');await assert.rejects(withScanner('Default',async()=>{throw new Error('fixture failed');}),/fixture failed/);assert.equal(process.listenerCount('SIGTERM'),before);`);
  const actual = commands(calls); assert.equal(actual.length, 2);
  assert.deepEqual(actual[0].slice(2), ['--json', '--state', '/fixture/owned-state.json', 'open', 'about:blank']);
  assert.equal(actual[1].at(-1), 'close');
}));
test('shutdown tracking closes only owned sessions while a shared session is in use', () => withFixture(value => {
  const calls = run(value, `const originalKill=process.kill;process.kill=(pid,signal)=>{assert.equal(pid,process.pid);assert.equal(signal,'SIGINT');return true;};try{await withScanner('Default',async owned=>{process.env.DOGFOOD_BROWSER_SESSION='owned-shared-fixture';await withScanner('Default',async shared=>{assert.equal(shared.session,'owned-shared-fixture');await shared.command(['snapshot']);process.emit('SIGINT','SIGINT');});});}finally{process.kill=originalKill;}`);
  const closed = commands(calls).filter(args => args.at(-1) === 'close');
  assert.equal(closed.length, 2); closed.forEach(args => assert.match(args[1], /^dogfood-scan-[a-f0-9]{8}$/));
}));
