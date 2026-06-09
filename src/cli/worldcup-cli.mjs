#!/usr/bin/env node
// Kalshi World Cup spread predictability CLI.
//
// Fetches the Men's World Cup winner (and related) markets from Kalshi's public
// API, computes predictability metrics, and ranks them by "safest favorite" or
// "best risk-adjusted". Offline mode reads a saved snapshot so it runs anywhere.
//
// Examples:
//   node src/cli/worldcup-cli.mjs --top 15
//   node src/cli/worldcup-cli.mjs --offline test/fixtures/kalshi-worldcup.json --sort risk
//   node src/cli/worldcup-cli.mjs --sort risk --probs my-probs.json --json
//   node src/cli/worldcup-cli.mjs --save test/fixtures/kalshi-worldcup.json

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import {
  getMarkets,
  fetchMarkets,
  saveSnapshot,
  DEFAULT_EVENT,
  DEFAULT_BASE,
} from '../data/adapters/kalshi.mjs';
import { rankMarkets, SCORE_WEIGHTS } from '../engine/predictability.mjs';

const HELP = `Kalshi World Cup spread predictability

Usage: node src/cli/worldcup-cli.mjs [options]

Options:
  --event <ticker>   Kalshi event ticker        (default ${DEFAULT_EVENT})
  --offline <file>   read a saved JSON snapshot instead of fetching live
  --save <file>      fetch live, write raw snapshot to <file>, then continue
  --probs <file>     JSON map {"Team": 0.18, ...} of your own true probabilities
                     -> adds edge / EV / Kelly columns; --sort risk ranks by EV
  --sort safe|risk   ranking key                (default safe)
  --top <N>          limit rows                 (default 20)
  --json             emit machine JSON instead of a table
  --base <url>       API base                   (default ${DEFAULT_BASE})
  --help             show this help

"safe"  = highest market-implied probability (literally most predictable).
"risk"  = transparent safety x payout score, or expected value when --probs set.
`;

async function main() {
  const { values } = parseArgs({
    options: {
      event: { type: 'string', default: DEFAULT_EVENT },
      offline: { type: 'string' },
      save: { type: 'string' },
      probs: { type: 'string' },
      sort: { type: 'string', default: 'safe' },
      top: { type: 'string', default: '20' },
      json: { type: 'boolean', default: false },
      base: { type: 'string', default: DEFAULT_BASE },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.sort !== 'safe' && values.sort !== 'risk') {
    throw new Error(`--sort must be 'safe' or 'risk', got '${values.sort}'`);
  }

  // Optionally snapshot live data to disk before analyzing.
  if (values.save && !values.offline) {
    const snap = await fetchMarkets({ eventTicker: values.event, base: values.base });
    await saveSnapshot(values.save, snap);
    process.stderr.write(`saved ${snap.markets.length} markets -> ${values.save}\n`);
  }

  const { event, markets, fetchedAt, source } = await getMarkets({
    offlineFile: values.offline,
    eventTicker: values.event,
    base: values.base,
  });

  const probs = values.probs ? JSON.parse(await readFile(values.probs, 'utf8')) : null;
  const rows = rankMarkets(markets, { sort: values.sort, probs });
  const top = rows.slice(0, Number(values.top) || rows.length);

  if (values.json) {
    process.stdout.write(
      JSON.stringify(
        { event, fetchedAt, source, sort: values.sort, weights: SCORE_WEIGHTS, rows: top },
        null,
        2,
      ) + '\n',
    );
    return;
  }

  printTable({ event, fetchedAt, source, sort: values.sort, rows: top, haveProbs: Boolean(probs) });
}

function printTable({ event, fetchedAt, source, sort, rows, haveProbs }) {
  const out = [];
  out.push(`Kalshi World Cup predictability — ${event}`);
  out.push(`source: ${source}${fetchedAt ? `   fetched: ${fetchedAt}` : ''}   sort: ${sort}`);
  out.push('');

  const cols = [
    { h: '#', w: 3, f: (_r, i) => String(i + 1), pad: 'start' },
    { h: 'Outcome', w: 26, f: (r) => trunc(r.team ?? r.title ?? r.ticker, 26) },
    { h: 'Ask¢', w: 5, f: (r) => fmtNum(r.yesAsk, 0), pad: 'start' },
    { h: 'Implied', w: 8, f: (r) => fmtPct(r.impliedProb), pad: 'start' },
    { h: 'Return', w: 8, f: (r) => fmtPct(r.returnIfWin), pad: 'start' },
    { h: 'Spread¢', w: 8, f: (r) => fmtNum(r.spreadCents, 0), pad: 'start' },
    { h: 'Score', w: 7, f: (r) => fmtNum(r.score, 3), pad: 'start' },
  ];
  if (haveProbs) {
    cols.push(
      { h: 'True', w: 7, f: (r) => fmtPct(r.trueProb), pad: 'start' },
      { h: 'Edge', w: 7, f: (r) => fmtPct(r.edge, true), pad: 'start' },
      { h: 'EV', w: 7, f: (r) => fmtNum(r.ev, 3, true), pad: 'start' },
      { h: 'Kelly', w: 7, f: (r) => fmtPct(r.kelly), pad: 'start' },
    );
  }

  out.push(cols.map((c) => pad(c.h, c.w, c.pad)).join('  '));
  out.push(cols.map((c) => '-'.repeat(c.w)).join('  '));
  rows.forEach((r, i) => {
    out.push(cols.map((c) => pad(c.f(r, i), c.w, c.pad)).join('  '));
  });

  out.push('');
  out.push(
    haveProbs
      ? 'Edge/EV/Kelly use YOUR --probs as the true probability. Positive EV = +value at the ask.'
      : 'No --probs supplied: on an efficient market, expected edge is ~0. "Score" reflects your',
  );
  if (!haveProbs) {
    out.push(
      `  safety/payout preference (safety ${SCORE_WEIGHTS.safety} / payout ${SCORE_WEIGHTS.payout}), not a profit prediction.`,
    );
  }
  out.push('Not investment advice.');
  process.stdout.write(out.join('\n') + '\n');
}

// --- formatting helpers -----------------------------------------------------

function pad(s, w, dir = 'end') {
  s = String(s);
  return dir === 'start' ? s.padStart(w) : s.padEnd(w);
}
function trunc(s, w) {
  s = String(s ?? '');
  return s.length > w ? s.slice(0, w - 1) + '…' : s;
}
function fmtPct(x, signed = false) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  const v = (x * 100).toFixed(1) + '%';
  return signed && x > 0 ? '+' + v : v;
}
function fmtNum(x, dp = 2, signed = false) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  const v = x.toFixed(dp);
  return signed && x > 0 ? '+' + v : v;
}

main().catch((err) => {
  process.stderr.write(`error: ${err.message}\n`);
  process.exit(1);
});
