// Predictability engine for Kalshi-style binary prediction markets.
//
// PURE functions only — no I/O, no fetch, no fs. Everything here takes plain
// numbers/objects and returns numbers/objects, so it is trivially unit-tested
// with `node --test` and reusable by the CLI, the dashboard, or n8n.
//
// Price convention: Kalshi contracts trade in integer cents 1..99. A YES
// contract bought at `ask` cents pays out 100 cents if the event resolves YES.
// Probabilities throughout are decimals in (0, 1).

/** Clamp `x` into the inclusive range [lo, hi]. */
export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Mid price in cents from the YES bid/ask, falling back to last traded price.
 * Returns null when nothing usable is available.
 */
export function midCents({ yesBid, yesAsk, lastPrice } = {}) {
  if (isNum(yesBid) && isNum(yesAsk)) return (yesBid + yesAsk) / 2;
  if (isNum(yesAsk)) return yesAsk;
  if (isNum(yesBid)) return yesBid;
  if (isNum(lastPrice)) return lastPrice;
  return null;
}

/**
 * Market-implied probability (decimal 0..1) from the mid price.
 * This is the "how predictable" axis — higher means a safer favorite.
 */
export function impliedProb(market) {
  const mid = midCents(market);
  return mid == null ? null : mid / 100;
}

/**
 * Return on stake if the YES contract wins, buying at the ask.
 * e.g. ask 80c -> (100-80)/80 = 0.25 (+25%). ask 50c -> 1.0 (+100%).
 */
export function returnIfWin(yesAskCents) {
  if (!isNum(yesAskCents) || yesAskCents <= 0) return null;
  return (100 - yesAskCents) / yesAskCents;
}

/**
 * Breakeven probability = the price you pay, expressed as a probability.
 * Buying at the ask, you need the true probability to exceed this to be +EV.
 */
export function breakeven(yesAskCents) {
  if (!isNum(yesAskCents)) return null;
  return yesAskCents / 100;
}

/** Bid/ask spread in cents — a liquidity / uncertainty proxy. */
export function spreadCents({ yesBid, yesAsk } = {}) {
  if (isNum(yesBid) && isNum(yesAsk)) return yesAsk - yesBid;
  return null;
}

// ---------------------------------------------------------------------------
// Default risk-adjusted score (NO external probabilities).
//
// HONEST FRAMING: if you treat the market mid as the true probability, the
// expected edge of every contract is ~0 (an efficient market). So this score
// does NOT claim positive expected value. It is a transparent safety x payout
// composite. The weights express *your preference* along the safety<->payout
// frontier (high probability pays little; long shots pay a lot). They do not
// manufacture an edge. Defaults lean toward safety, matching "most predictable
// payout with a return still worth taking".
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = { safety: 0.6, payout: 0.4, spreadPenalty: 0.1 };

/**
 * Composite score in roughly [-0.1, 1]. Higher is "more attractive" given the
 * chosen weights. All terms are normalized to ~0..1 so the blend is readable.
 *
 *   safetyTerm = p                 (implied probability; higher = safer)
 *   payoutTerm = r / (1 + r) = 1 - breakeven   (a 10c contract -> ~0.9)
 *   spreadTerm = min(spread, 10) / 10          (wider spread -> bigger penalty)
 */
export function riskAdjustedScore({ p, r, spreadCents: spread = 0, weights = SCORE_WEIGHTS }) {
  if (!isNum(p) || !isNum(r)) return null;
  const safetyTerm = p;
  const payoutTerm = r / (1 + r);
  const spreadTerm = isNum(spread) ? clamp(spread, 0, 10) / 10 : 0;
  return (
    weights.safety * safetyTerm +
    weights.payout * payoutTerm -
    weights.spreadPenalty * spreadTerm
  );
}

// ---------------------------------------------------------------------------
// Optional genuine-edge path (WHEN external true probabilities are supplied,
// e.g. de-vigged bookmaker odds or your own model). This is where real +EV
// opportunities — if any — actually show up.
// ---------------------------------------------------------------------------

/** Edge vs the ask: positive => the market underprices this outcome. */
export function edge({ trueProb, yesAskCents }) {
  const be = breakeven(yesAskCents);
  if (!isNum(trueProb) || be == null) return null;
  return trueProb - be;
}

/** Expected value per $1 staked buying YES at the ask. */
export function expectedValue({ trueProb, yesAskCents }) {
  const b = returnIfWin(yesAskCents);
  if (!isNum(trueProb) || b == null) return null;
  return trueProb * b + (1 - trueProb) * -1;
}

/**
 * Fractional Kelly stake as a fraction of bankroll, clamped to [0, 1].
 * f* = (b*p - q) / b, with b = payout-if-win, p = trueProb, q = 1 - p.
 * `fraction` scales it down (e.g. 0.5 for half-Kelly).
 */
export function kellyFraction({ trueProb, yesAskCents, fraction = 1 }) {
  const b = returnIfWin(yesAskCents);
  if (!isNum(trueProb) || b == null || b <= 0) return null;
  const q = 1 - trueProb;
  const f = (b * trueProb - q) / b;
  return clamp(f * fraction, 0, 1);
}

/**
 * Enrich and rank an array of normalized markets.
 *
 * @param {Array} markets  normalized markets (see adapters/kalshi.mjs)
 * @param {object} opts
 *   sort:   'safe' (implied prob desc) | 'risk' (EV desc if probs, else score desc)
 *   probs:  optional map team->trueProb (lowercased keys) enabling edge/EV/kelly
 *   weights: override SCORE_WEIGHTS
 *   includeClosed: keep settled/closed markets (default false)
 * @returns {Array} enriched rows sorted by the chosen key
 */
export function rankMarkets(markets, { sort = 'safe', probs = null, weights, includeClosed = false } = {}) {
  const probMap = probs ? normalizeProbKeys(probs) : null;

  const rows = markets
    .filter((m) => includeClosed || isTradeable(m))
    .map((m) => {
      const p = impliedProb(m);
      const ask = m.yesAsk;
      const r = returnIfWin(ask);
      const spread = spreadCents(m);
      const flags = [];
      if (!isTradeable(m)) flags.push(m.status || 'inactive');
      if (!isNum(ask)) flags.push('no-ask');

      const row = {
        ticker: m.ticker,
        team: m.team,
        title: m.title,
        yesAsk: ask,
        impliedProb: p,
        returnIfWin: r,
        breakeven: breakeven(ask),
        spreadCents: spread,
        volume: m.volume ?? null,
        score: riskAdjustedScore({ p, r, spreadCents: spread, weights }),
        flags,
      };

      if (probMap) {
        const tp = lookupProb(probMap, m);
        if (tp != null) {
          row.trueProb = tp;
          row.edge = edge({ trueProb: tp, yesAskCents: ask });
          row.ev = expectedValue({ trueProb: tp, yesAskCents: ask });
          row.kelly = kellyFraction({ trueProb: tp, yesAskCents: ask });
        } else {
          row.flags.push('no-prob');
        }
      }
      return row;
    });

  const cmp = sortComparator(sort, Boolean(probMap));
  return rows.sort(cmp);
}

function sortComparator(sort, haveProbs) {
  if (sort === 'risk') {
    const key = haveProbs ? 'ev' : 'score';
    return (a, b) => num(b[key]) - num(a[key]);
  }
  // default 'safe': most predictable first
  return (a, b) => num(b.impliedProb) - num(a.impliedProb);
}

// --- small internal helpers -------------------------------------------------

function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function num(x) {
  return isNum(x) ? x : -Infinity;
}

function isTradeable(m) {
  const s = (m.status || 'active').toLowerCase();
  return s === 'active' || s === 'open' || s === 'initialized';
}

function normalizeProbKeys(probs) {
  const out = new Map();
  for (const [k, v] of Object.entries(probs)) {
    if (isNum(v)) out.set(k.trim().toLowerCase(), v);
  }
  return out;
}

function lookupProb(probMap, m) {
  for (const key of [m.team, m.title, m.ticker]) {
    if (key && probMap.has(String(key).trim().toLowerCase())) {
      return probMap.get(String(key).trim().toLowerCase());
    }
  }
  return null;
}
