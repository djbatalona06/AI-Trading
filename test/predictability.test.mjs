import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  midCents,
  impliedProb,
  returnIfWin,
  breakeven,
  spreadCents,
  riskAdjustedScore,
  edge,
  expectedValue,
  kellyFraction,
  rankMarkets,
  clamp,
} from '../src/engine/predictability.mjs';
import { normalizeMarket } from '../src/data/adapters/kalshi.mjs';

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('midCents prefers bid/ask mid, falls back to last price', () => {
  approx(midCents({ yesBid: 70, yesAsk: 74 }), 72);
  approx(midCents({ yesAsk: 80 }), 80);
  approx(midCents({ lastPrice: 33 }), 33);
  assert.equal(midCents({}), null);
});

test('impliedProb is the mid as a decimal', () => {
  approx(impliedProb({ yesBid: 70, yesAsk: 74 }), 0.72);
  assert.equal(impliedProb({}), null);
});

test('returnIfWin and breakeven', () => {
  approx(returnIfWin(80), 0.25);
  approx(returnIfWin(50), 1.0);
  approx(breakeven(80), 0.8);
  assert.equal(returnIfWin(0), null);
});

test('spreadCents', () => {
  assert.equal(spreadCents({ yesBid: 16, yesAsk: 17 }), 1);
  assert.equal(spreadCents({ yesAsk: 17 }), null);
});

test('riskAdjustedScore: composite and monotonic in spread', () => {
  const p = 0.9;
  const r = returnIfWin(91); // a ~91c contract
  const tight = riskAdjustedScore({ p, r, spreadCents: 1 });
  const wide = riskAdjustedScore({ p, r, spreadCents: 9 });
  assert.ok(tight > wide, 'wider spread lowers the score');
  // safety-leaning default: a 90% favorite scores well above 0
  assert.ok(tight > 0.5);
});

test('edge / expectedValue / kelly with a real edge', () => {
  // true 0.5 vs paying 40c => +EV, positive kelly
  approx(edge({ trueProb: 0.5, yesAskCents: 40 }), 0.1);
  assert.ok(expectedValue({ trueProb: 0.5, yesAskCents: 40 }) > 0);
  const k = kellyFraction({ trueProb: 0.5, yesAskCents: 40 });
  assert.ok(k > 0 && k <= 1);
});

test('kelly clamps to 0 when below breakeven', () => {
  // true 0.3 but paying 50c => -EV => no stake
  assert.ok(expectedValue({ trueProb: 0.3, yesAskCents: 50 }) < 0);
  assert.equal(kellyFraction({ trueProb: 0.3, yesAskCents: 50 }), 0);
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});

test('normalizeMarket maps raw Kalshi fields', () => {
  const n = normalizeMarket({
    ticker: 'KX-FOO',
    title: 'Will Foo win?',
    yes_sub_title: 'Foo',
    yes_bid: 16,
    yes_ask: 17,
    no_bid: 83,
    no_ask: 84,
    last_price: 17,
    volume: 100,
    open_interest: 20,
    status: 'active',
  });
  assert.equal(n.ticker, 'KX-FOO');
  assert.equal(n.team, 'Foo');
  assert.equal(n.yesAsk, 17);
  assert.equal(n.volume, 100);
});

test('rankMarkets --sort safe orders by implied prob desc (fixture)', async () => {
  const markets = await loadFixtureMarkets();
  const rows = rankMarkets(markets, { sort: 'safe' });
  // most predictable first => the high-probability advancement contracts
  assert.ok(rows[0].impliedProb >= rows[1].impliedProb);
  assert.ok(rows[0].impliedProb > 0.9, 'top safe pick is a strong favorite');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].impliedProb >= rows[i].impliedProb, 'monotonic non-increasing');
  }
});

test('rankMarkets --sort risk with probs orders by EV desc', async () => {
  const markets = await loadFixtureMarkets();
  const probs = JSON.parse(
    await readFile(fileURLToPath(new URL('./fixtures/probs.sample.json', import.meta.url)), 'utf8'),
  );
  const rows = rankMarkets(markets, { sort: 'risk', probs });
  const evs = rows.filter((r) => typeof r.ev === 'number').map((r) => r.ev);
  for (let i = 1; i < evs.length; i++) {
    assert.ok(evs[i - 1] >= evs[i], 'EV non-increasing');
  }
});

async function loadFixtureMarkets() {
  const raw = JSON.parse(
    await readFile(fileURLToPath(new URL('./fixtures/kalshi-worldcup.json', import.meta.url)), 'utf8'),
  );
  return raw.markets.map(normalizeMarket);
}
