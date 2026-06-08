// Kalshi public-market data adapter.
//
// Reads prediction-market spreads from Kalshi's PUBLIC v2 REST API (no auth
// required for market reads) and normalizes them into a stable internal shape.
// Every assumption about Kalshi's response fields is isolated in
// `normalizeMarket()` — if the live API differs, that is the only function to
// touch; the engine and CLI stay untouched.
//
// NOTE: Kalshi's edge (Cloudflare) blocks some datacenter/sandbox IPs with
// HTTP 403. When that happens, run live from your own machine, or use
// `loadSnapshot()` (the CLI's `--offline` flag) against a saved JSON snapshot.

import { readFile, writeFile } from 'node:fs/promises';

export const DEFAULT_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
export const DEFAULT_SERIES = 'KXMENWORLDCUP';
export const DEFAULT_EVENT = 'KXMENWORLDCUP-26';

/**
 * Fetch every market for an event, following cursor pagination.
 * @returns {Promise<{event:string, markets:object[], fetchedAt:string, source:string}>}
 */
export async function fetchMarkets({
  eventTicker = DEFAULT_EVENT,
  base = DEFAULT_BASE,
  fetchImpl = globalThis.fetch,
  limit = 200,
  maxPages = 50,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch unavailable — Node 18+ required (or pass fetchImpl)');
  }
  const all = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${base}/markets`);
    url.searchParams.set('event_ticker', eventTicker);
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);

    const body = await getJson(url, fetchImpl);
    const markets = body.markets || [];
    all.push(...markets);

    cursor = body.cursor || '';
    if (!cursor || markets.length === 0) break;
  }
  return {
    event: eventTicker,
    markets: all,
    fetchedAt: new Date().toISOString(),
    source: 'live',
  };
}

/**
 * Fetch event metadata (optionally with nested markets in a single call).
 */
export async function fetchEvent({
  eventTicker = DEFAULT_EVENT,
  base = DEFAULT_BASE,
  fetchImpl = globalThis.fetch,
  withNested = false,
} = {}) {
  const url = new URL(`${base}/events/${encodeURIComponent(eventTicker)}`);
  if (withNested) url.searchParams.set('with_nested_markets', 'true');
  return getJson(url, fetchImpl);
}

/** Load a previously saved snapshot file; returns the same shape as fetchMarkets. */
export async function loadSnapshot(filePath) {
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  const markets = data.markets || [];
  return {
    event: data.event || DEFAULT_EVENT,
    markets,
    fetchedAt: data.fetchedAt || null,
    source: `offline:${filePath}`,
  };
}

/** Persist a fetched snapshot to disk (used by the CLI `--save` flag). */
export async function saveSnapshot(filePath, snapshot) {
  await writeFile(filePath, JSON.stringify(snapshot, null, 2) + '\n');
}

/**
 * Top-level resolver used by the CLI: offline file if given, else live fetch.
 * Returns { event, markets (NORMALIZED), fetchedAt, source }.
 */
export async function getMarkets({
  offlineFile,
  eventTicker = DEFAULT_EVENT,
  base = DEFAULT_BASE,
  fetchImpl = globalThis.fetch,
} = {}) {
  const raw = offlineFile
    ? await loadSnapshot(offlineFile)
    : await fetchMarkets({ eventTicker, base, fetchImpl });
  return { ...raw, markets: raw.markets.map(normalizeMarket) };
}

/**
 * Normalize one raw Kalshi market into the engine-ready record. This is the
 * single choke point for every Kalshi field-name assumption.
 *
 * Assumed raw fields (confirm on first live run):
 *   ticker, title, yes_sub_title|subtitle, yes_bid, yes_ask, no_bid, no_ask,
 *   last_price, volume, open_interest, status   (prices = integer cents 1..99)
 */
export function normalizeMarket(raw = {}) {
  return {
    ticker: raw.ticker ?? null,
    title: raw.title ?? raw.yes_sub_title ?? raw.subtitle ?? raw.ticker ?? null,
    team: raw.yes_sub_title ?? raw.subtitle ?? raw.title ?? raw.ticker ?? null,
    yesBid: cents(raw.yes_bid),
    yesAsk: cents(raw.yes_ask),
    noBid: cents(raw.no_bid),
    noAsk: cents(raw.no_ask),
    lastPrice: cents(raw.last_price),
    volume: numOrNull(raw.volume),
    openInterest: numOrNull(raw.open_interest),
    status: raw.status ?? null,
  };
}

// --- internals --------------------------------------------------------------

async function getJson(url, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(String(url), { headers: { Accept: 'application/json' } });
  } catch (err) {
    throw new Error(`network error fetching ${url}: ${err.message}`);
  }
  if (!res.ok) {
    const hint =
      res.status === 403
        ? ' (Kalshi blocks some datacenter/sandbox IPs — run locally or use --offline)'
        : '';
    throw new Error(`HTTP ${res.status} fetching ${url}${hint}`);
  }
  return res.json();
}

function cents(v) {
  const n = numOrNull(v);
  return n == null ? null : n;
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
