# Overview — Pelosi Tracker

A detailed look at capability, price-accuracy, the planned n8n agent catalog,
external integrations, and the feature roadmap.

---

## 1. What this is

A personal indicator + offline interactive dashboard + automation library that
turns **public STOCK Act disclosures** into a profitability picture of Nancy
Pelosi's (really Paul Pelosi's) trades, plus a realistic **copy-trade
backtest** that any retail user could actually execute given the ~45-day
disclosure lag.

The repo also exposes a small headless **indicator engine** and CLI so your
collection of agents — n8n, Claude, MCP clients, shell — can call into the
same math the dashboard uses.

## 2. Capability — what it does

Computed from disclosure data + price series:

- **Pelosi Profit Indicator (PPI)** — a transparent 0–100 composite score
  blending cumulative return, alpha vs SPY, win rate, average disclosure lag,
  and trade count. Weights are exported as `PPI_WEIGHTS`; nothing hidden.
- **Estimated equity curve** vs SPY benchmark, using bracket-midpoint position
  sizing from disclosure amount ranges.
- **Realized & unrealized P&L** with cost-basis tracking; per-ticker breakdown.
- **Disclosure-lag analytics** — distribution of (filing date − transaction
  date) per trade.
- **Win rate** on closed trades.
- **Copy-trade backtest simulator** — the headline interactive feature. Set
  starting capital, pick an entry rule (`transaction_date` or, realistically,
  `disclosure_date`), overlay your curve against hers and SPY.
- **Standard technicals** — SMA, EMA, RSI, MACD, Bollinger Bands — for the
  agents to call per-ticker.

**Reference numbers** (real-world, for sanity-check):

- Pelosi cumulative return ~768% since 2014 vs ~266% for S&P 500.
- 2023: ~66% · 2024: ~54% · 2025: ~18% (S&P ~16.6% in 2025).
- ~87% reported win rate across disclosed trades.

The snapshot dataset is seeded to be **consistent** with these public figures;
exact reproduction is not the goal (the underlying data has range uncertainty).

## 3. Price-accuracy — the honest assessment

This tool is **directionally strong, not precise**. Limitations are first-class
citizens in the design, not afterthoughts.

| Source of error | Effect on P&L estimate |
|---|---|
| **Amount ranges** ($1,001–$15,000 … $50M+) instead of exact dollars | ±10–30% on position-size, by bracket |
| **Top bracket unbounded** ($50M+) | Capped with documented assumption; flagged on the trade |
| **~45-day disclosure lag** | "Live Pelosi portfolio" view is stale by design; copy-trade backtest uses disclosure-date entry to model what a retail trader can actually do |
| **Options / LEAPS trades** | Cannot reconstruct strike/expiry/premium from a range — these trades are **flagged and shown with a wide error band**, not a point estimate |
| **Sales-to-buys matching** | Lot matching is heuristic (FIFO default) when a partial sale follows multiple buys |
| **Pre-existing holdings** | Filings disclose transactions, not full portfolio; pre-existing positions are inferred only when sold |
| **Data-source freshness** | House Stock Watcher's free API died in 2026; FMP/Quiver free tiers have daily caps; Stooq is daily-bar only |

**Net:** treat absolute dollar P&L as ±15–30% band for equity trades, and
treat options trade P&L as "qualitatively flagged" not quantified. Relative
metrics (alpha vs SPY, win rate, PPI score) are more reliable than absolute
dollars.

## 4. n8n agent catalog (~72 workflows)

Self-hosted via Docker (see `docker-compose.yml`, Phase 4). LLM credential
defaults to **Groq free tier** (30 RPM / 14,400 req/day) and **Ollama local**.

**Categories**

| Category | Count | One-line purpose | Trigger pattern |
|---|---|---|---|
| Congressional / Pelosi tracking | 12 | Poll disclosure source → detect new Pelosi filing → enrich → alert | Schedule (6h) → HTTP → Code → IF new → notify |
| Technical indicators | 18 | RSI/MACD/SMA/EMA/Bollinger threshold alerts per ticker | Schedule (daily/intraday) → HTTP price → Code → IF threshold → notify |
| News & sentiment | 10 | RSS/news feed → filter keywords → AI sentiment score → digest | RSS/HTTP → Filter → AI Agent → notify |
| Options flow | 8 | Unusual options volume / IV spikes / LEAPS expiry watches | Schedule → HTTP → Code → IF → notify |
| Bonds / macro | 8 | Treasury yield-curve, CPI release, FOMC calendar alerts | Schedule → HTTP → Code → IF → notify |
| Portfolio & utility | 12 | Daily digest, watchlist sync, on-demand backtest (Execute Command), webhook alert receiver | Webhook/Schedule → HTTP/Code → notify |
| Master AI assistant | 4 | Chat-driven agent that can call our CLI **and** external MCPs as tools | Chat Trigger → AI Agent ← (Chat Model, Memory, HTTP Request Tool) |

**Delivered as:** 12 hand-crafted **masters** (verified against real n8n
example JSONs in `n8n-docs`) + a `tools/gen-workflows.mjs` generator that
fans out ~60 variants by parameterizing tickers, indicator params, schedules,
and notification channels. Every generated file gets fresh UUIDs, validated
connections, and a Sticky Note listing required credentials.

**How to run (Phase 4):**

```bash
# 1. Start n8n + Ollama + Postgres + Qdrant
docker compose up -d

# 2. Open the n8n UI
open http://localhost:5678

# 3. Generate the workflow library
npm run gen:workflows
#    → writes ~60 files into n8n/generated/<category>/

# 4. Import workflows via n8n UI:
#    Workflows → Import from File → pick from n8n/masters/ or n8n/generated/

# 5. Set credentials once per workflow:
#    - Groq API (free tier) OR Ollama (auto-detected if local)
#    - Telegram / Discord / Slack webhook for alerts
#    - FMP_API_KEY for live congressional data

# 6. Activate the workflows you want; they run on their schedules.
```

**Pinning:** `typeVersion` values across nodes are pinned to conservative,
widely-supported numbers (target **n8n ≥ 1.6x**). On import, n8n auto-migrates
older versions; newer-than-installed will refuse — pull the latest n8n image
if any import fails.

## 5. External integrations (MCPs, agents, services)

All free or open-source. Phase 5 documents copy-paste install snippets; below
is the catalog you can wire up.

### MCP servers (drop into `~/.claude/mcp.json` or equivalent)

| MCP | What it adds | Cost |
|---|---|---|
| [**Alpha Vantage MCP**](https://mcp.alphavantage.co/) | Real-time + historical equities, FX, crypto, 50+ TA indicators | Free tier (25 req/day) |
| [**Financial Datasets MCP**](https://github.com/financial-datasets/mcp-server) | Income statements, balance sheets, cash flow, prices, market news | Free tier on financialdatasets.ai |
| [**TradingView MCP**](https://github.com/atilaahmettaner/tradingview-mcp) | 30+ TA tools, Bollinger intelligence, candlestick patterns, multi-exchange | Open source, free |
| [**MaverickMCP**](https://github.com/wshobson/maverick-mcp) | Personal stock analysis, portfolio optimization, FastMCP 2.0 | Open source, free |
| Catalog | [awesome-mcp-servers/finance--crypto](https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/finance--crypto.md) | — |

### Data sources used by our adapters

- **FMP free** (250 calls/day) — House/Senate trading endpoints
- **disclosures-clerk.house.gov** — canonical XML, twice-daily, free
- **Quiver Quantitative** free tier — delayed congressional data
- **Stooq** — free daily OHLCV (no key)
- **Alpha Vantage** free — 25 calls/day, 50+ indicators
- **Finnhub** free — 60 calls/min, news + fundamentals
- **FCS API** — 500 calls/month free tier
- **Apify free credit** — fallback scraper for Capitol Trades / news sites

### LLM providers (for n8n AI Agent nodes)

- **Groq** free — 30 RPM, 14,400 req/day, fastest inference (Llama 3.x)
- **Ollama** local — zero cost, no rate limits (Llama 3.2 3B on 8GB, larger on GPU)
- **Google Gemini** free — generous tier on Gemini Flash
- **OpenRouter** — $5 trial credit, single key across many providers
- **DeepSeek** — cheap paid option if free tiers exhaust

### Notification channels

- Telegram bot (free, n8n native node)
- Discord webhook (free, n8n native node)
- Slack (free workspace, n8n native node)
- SMTP / Email (free with any provider)

## 6. Features

### v0.1 (covered in Phases 0–5)

- Offline single-file dashboard (PPI gauge, equity curve, leaderboard, copy-trade simulator)
- Indicator engine + CLI
- Live data toggle (FMP / Stooq / Quiver / House Clerk adapters)
- ~72 importable n8n workflows across 7 categories
- Documented external MCP integrations

### v0.2+ (Phase 6 roadmap)

- **Multi-member comparison** — Pelosi vs other top congressional traders side-by-side
- **Sector allocation** view with rotation timeline
- **Options-flow live feed** integration via TradingView MCP
- **Self-hosted MCP server** wrapping our engine via `mcp-toolbox` so Claude
  can query the data directly
- **Static deploy** to Cloudflare Pages / GitHub Pages (still $0/mo)
- **CSV export** of all computed series
- **Dark mode** + mobile layout
- **Multi-asset support** — bonds & options carved out as first-class views
- **Push notifications** (PWA / web push) on new disclosures
- **Backtester upgrades** — fractional sizing, fee model, slippage, tax-aware exits

## 7. Build & run cheatsheet (after each phase lands)

```bash
# Phase 1 outputs
npm test                       # engine determinism
node src/cli/indicator-cli.mjs ppi

# Phase 2 outputs
npm run build                   # dist/dashboard.html
open dist/dashboard.html        # works offline

# Phase 3 — live mode
FMP_API_KEY=... npm run cli -- refresh

# Phase 4 — n8n stack
docker compose up -d
npm run gen:workflows           # generates ~60 JSONs
# import in the n8n UI
```

## 8. Disclaimer

This tool consumes **public STOCK Act disclosures**. It is educational. The
PPI score and backtests are illustrative; weights and assumptions are disclosed
in code. Estimates have known error bands documented above. **Not financial
advice.**

## References

- n8n self-host kit: <https://github.com/n8n-io/self-hosted-ai-starter-kit>
- LLM provider comparison (n8n): <https://axshul.site/n8n/guide/ai-inference-providers/>
- Groq pricing: <https://tokenmix.ai/blog/groq-api-pricing>
- Free stock APIs honest comparison: <https://dev.to/nexgendata/best-free-stock-market-apis-and-data-tools-in-2026-a-developers-honest-comparison-1926>
- Free congress trackers 2026: <https://tradercongress.com/blog/free-congress-stock-trading-tracker>
- House Clerk disclosures: <https://disclosures-clerk.house.gov/FinancialDisclosure>
- awesome-mcp-servers finance: <https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/finance--crypto.md>
