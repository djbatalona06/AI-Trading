# AI-Trading — Personal Pelosi Tracker

An indicator + interactive offline dashboard + n8n agent library for tracking
**publicly disclosed congressional stock trades** (under the STOCK Act),
focused on Nancy/Paul Pelosi's portfolio.

> **What this is:** an educational tool built on public disclosure data.
> **What this isn't:** investment advice, insider information, or a live
> brokerage. ETFs like NANC/KRUZ already commercialize this exact approach.

## Project state

Prototype, Phase 0. See:

- [`ROADMAP.md`](./ROADMAP.md) — the phased plan (target cost: **$0/mo**).
- [`OVERVIEW.md`](./OVERVIEW.md) — capability, price-accuracy, n8n agent
  catalog, integrations, and the feature roadmap.

## Quick start (planned, after Phase 2)

```bash
# Offline dashboard artifact — open in any browser, no network needed
open dist/dashboard.html
```

```bash
# Headless indicator engine (for agents)
node src/cli/indicator-cli.mjs ppi
node src/cli/indicator-cli.mjs backtest --capital 100000
```

```bash
# Self-hosted n8n with the AI starter kit
docker compose up -d
# then import workflows from n8n/masters/ and n8n/generated/
```

## Tech stack (minimum cost)

Zero-dep ES modules · Vendored Chart.js (no CDN) · Node 20+ · Docker for n8n ·
Self-hosted [n8n AI Starter Kit](https://github.com/n8n-io/self-hosted-ai-starter-kit)
(n8n + Postgres + Ollama + Qdrant) · Groq free tier or local Ollama for LLM ·
FMP / Stooq / disclosures-clerk.house.gov for free data.

## Disclaimer

Built on public STOCK Act disclosures. Estimates derived from disclosure
*ranges* (not exact dollar amounts) and the ~45-day filing lag. P&L for
options/LEAPS trades cannot be precisely modeled from disclosures and is shown
with explicit error bands. Not financial advice.
