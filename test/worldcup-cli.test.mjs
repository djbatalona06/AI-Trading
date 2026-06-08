import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

const CLI = fileURLToPath(new URL('../src/cli/worldcup-cli.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/kalshi-worldcup.json', import.meta.url));
const PROBS = fileURLToPath(new URL('./fixtures/probs.sample.json', import.meta.url));

async function cli(args) {
  return run(process.execPath, [CLI, ...args]);
}

test('--help prints usage and exits 0', async () => {
  const { stdout } = await cli(['--help']);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /--probs/);
});

test('--json --sort safe returns valid JSON ranked by implied prob', async () => {
  const { stdout } = await cli(['--offline', FIXTURE, '--json', '--sort', 'safe']);
  const data = JSON.parse(stdout);
  assert.equal(data.event, 'KXMENWORLDCUP-26');
  assert.ok(data.rows.length > 0);
  assert.ok(data.rows[0].impliedProb >= data.rows[1].impliedProb, 'safe sort is non-increasing');
  assert.ok(data.rows[0].impliedProb > 0.9, 'top safe pick is a strong favorite');
});

test('--sort risk --probs adds EV and ranks by it', async () => {
  const { stdout } = await cli(['--offline', FIXTURE, '--json', '--sort', 'risk', '--probs', PROBS]);
  const data = JSON.parse(stdout);
  const evRows = data.rows.filter((r) => typeof r.ev === 'number');
  assert.ok(evRows.length > 0, 'EV present when --probs supplied');
  for (let i = 1; i < evRows.length; i++) {
    assert.ok(evRows[i - 1].ev >= evRows[i].ev, 'EV non-increasing');
  }
});

test('table mode renders a header row', async () => {
  const { stdout } = await cli(['--offline', FIXTURE, '--top', '3']);
  assert.match(stdout, /Outcome/);
  assert.match(stdout, /Implied/);
  assert.match(stdout, /Not investment advice/);
});

test('invalid --sort exits non-zero with a clear message', async () => {
  await assert.rejects(
    cli(['--offline', FIXTURE, '--sort', 'bogus']),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /--sort must be/);
      return true;
    },
  );
});
