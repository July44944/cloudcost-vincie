# CloudCost Lens

A multi-cloud (AWS / Azure / GCP / Huawei Cloud) billing visualization and optimization tool — pure front-end, zero backend, zero build step. Upload a billing CSV (or load a built-in sample dataset) and get a cost breakdown, trend view, and a ranked list of optimization suggestions.

**Live demo:** `https://july44944.github.io/cloudcost-vincie/` (replace with the real link once deployed)

---

## What this is

The first thing most companies notice after moving to the cloud isn't "this is convenient" — it's "why is the bill this high, and why is it such a mess." This tool tries to answer three questions:

1. **Where is the money going** — break down cost by provider, service, region, and tag, and see the trend over time
2. **Where is it being wasted** — a transparent rule library (not a black-box model) flags idle resources, oversized instances, unattached storage volumes, and long-running workloads with no commitment discount
3. **Who should own this cost** — aggregate spend by team / project tag and surface governance gaps

All parsing and computation happens in the browser: an uploaded CSV never leaves your machine, which is also why this can ship as a static site on GitHub Pages.

## Features

- **Smart CSV detection** — automatically recognizes simplified AWS CUR / Azure Cost Management / GCP Billing Export / Huawei Cloud Resource Details formats, plus a generic template, from the header row alone
- **Unified multi-cloud view** — all four billing formats are normalized into one data model before anything is charted, so you can compare providers directly — including cross-currency (FX-converted to USD) and cross-granularity (daily vs. monthly billing cycles) data
- **5 dashboard charts** — cost trend by provider, cost breakdown by service category, top 10 resources by cost, provider × pricing model, and tag governance coverage
- **Rule-driven optimization suggestions** — every suggestion names the exact resources it's based on, an estimated savings amount, and a confidence level — never just a vague tip
- **5 built-in sample datasets** — one each for AWS / Azure / GCP / Huawei Cloud, plus a combined cross-cloud dataset that demonstrates the "unified view" differentiator directly
- **Opt-in AI Cost Advisor** — ask follow-up questions in plain language, answered by Claude and grounded only in this dataset's already-computed numbers (see [docs/prompt-library.md](docs/prompt-library.md) and [docs/user-journey.md](docs/user-journey.md))

## Tech stack

Deliberately the lightest stack that could work, so the whole thing can be pushed to a GitHub repo and served from GitHub Pages exactly like a personal homepage — no build step, no server, no environment variables:

| Layer | Choice |
|---|---|
| Page | Plain HTML / CSS / JS — no framework, no bundler |
| CSV parsing | [PapaParse](https://www.papaparse.com/) (via CDN) |
| Charts | [Chart.js](https://www.chartjs.org/) (via CDN) |
| Fonts | IBM Plex Sans / IBM Plex Mono (Google Fonts) |
| Deployment | GitHub Pages (static hosting) |

## Running locally

Browsers block `fetch()` under the `file://` protocol, so previewing locally needs a static server (either works):

```bash
# Option 1: Python
python3 -m http.server 8080

# Option 2: Node
npx serve .
```

Then open `http://localhost:8080`.

## Deploying to GitHub Pages

```bash
git init
git add .
git commit -m "Initial commit: CloudCost Lens"
git branch -M main
git remote add origin https://github.com/<your-username>/cloudcost-vincie.git
git push -u origin main
```

Then in the repo's **Settings → Pages**, set the Source to the `main` branch / root directory. It should be live at `https://<your-username>.github.io/cloudcost-vincie/` within a few minutes.

## Supported CSV formats

The "CSV format guide" section at the bottom of the page documents five recognizable header layouts:

- **Generic template** (recommended for your own data): `date, provider, account, service, region, resource_id, team, project, env, pricing_model, usage_qty, usage_unit, cost, currency, utilization_pct, attached`
- **AWS** — a simplified version of the core Cost & Usage Report fields
- **Azure** — a simplified version of the core Cost Management export fields
- **GCP** — a simplified version of the core BigQuery Billing Export fields
- **Huawei Cloud** — a simplified version of the core Resource Details export fields, modeled on a real export's column structure (fictional resource/tenant data — see note below)

The four provider formats include two custom extension fields (`utilization_pct` / `attached`) that don't exist in a real billing export — in production these typically come from a join against CloudWatch / Azure Monitor / Cloud Monitoring / Huawei Cloud Eye. The demo bakes them straight into the sample CSVs to keep things simple.

**Two things the Huawei format exercises that the other three don't:**

- **Cross-currency normalization** — the payment column's name carries the settlement currency, e.g. `Payment Amount(AED)`, and the demo account settles in AED rather than USD. On import, non-USD amounts are converted using a fixed FX table (`AED → USD` at the official 3.6725 peg) so they can be safely summed and charted alongside USD-denominated providers. Naively summing raw numbers across currencies would silently produce a wrong total — this is the kind of bug that's easy to miss in a demo and expensive in production.
- **Cross-granularity normalization** — Huawei's Resource Details export is billed monthly (one row per resource per `Billing Cycle`), not daily like the other three. The "commitment discount gap" rule accounts for this by checking what *share* of billing periods a resource appears in (≥50%) rather than a fixed day count, so it means the same thing whether the underlying data is daily or monthly.

**On authenticity:** the Huawei sample's column structure is modeled on a real Huawei Cloud billing export, but every value in `data/sample-huawei.csv` — tenant name, resource IDs, costs — is fictional. No real customer or billing data is included in this repository.

## Optimization rule library

Every suggestion comes from a rule, not a trained model, so the reasoning behind each one is easy to explain out loud:

| Rule | Trigger condition | Savings estimate |
|---|---|---|
| Idle compute | Compute resource, average utilization < 5% | Full cost of the resource across the dataset |
| Oversized compute | Compute resource, average utilization 5%–30% | Total cost × 40% (rule of thumb: typical rightsizing savings) |
| Unattached storage | Storage resource, `attached = false` | Full cost of the resource across the dataset |
| Commitment discount gap | Compute resource, on-demand, present in ≥50% of the dataset's billing periods | Total cost × 30% (rule of thumb: typical RI/Savings Plan/CUD discount tier) |
| Tag governance gap | Missing a team or project tag | Not counted toward savings — reported separately as a governance risk amount |

The 40% / 30% assumptions are themselves worth talking through in an interview — they're anchored to the discount ranges AWS/Azure/GCP publish for rightsizing and commitment discounts, not arbitrary numbers.

## AI Cost Advisor

An opt-in conversational layer (`js/aiAdvisor.js`) sits on top of everything above it, letting you ask questions like *"which suggestion should I do first?"* in plain language.

- **Off by default.** It's the only feature in this tool that sends data anywhere. Turning it on sends a compact JSON summary — totals, breakdowns, top resources, the rule engine's suggestions — directly from your browser to Anthropic's API. Never the raw CSV rows, never through any server of ours (there isn't one).
- **Bring your own key.** Stored only in `sessionStorage` — cleared the moment you close the tab, never written to disk, never sent anywhere except as the `x-api-key` header on a direct call to `api.anthropic.com`.
- **Grounded, not free-form.** The system prompt instructs the model to answer only from the supplied data and say so plainly when it can't — see [docs/prompt-library.md](docs/prompt-library.md) for the full prompt, the reasoning behind each instruction, example prompts by category, and an honest evaluation-gap list.
- **The conversation flow and design boundaries** (why it's read-only, why there's no tool-use, why it doesn't loop back into the rule engine) are diagrammed in [docs/user-journey.md](docs/user-journey.md).

Requires an [Anthropic API key](https://console.anthropic.com/) — usage is billed to your own account, this project has no relationship with your key beyond that one header.

## Regenerating the sample data

The five CSVs under `data/` are generated by a script (fixed random seed, fully reproducible):

```bash
python3 scripts/generate_sample_data.py
```

The script defines 10 resources per provider (a mix of idle / normal / oversized / already-committed / untagged). AWS, Azure, and GCP span 2026-06-01 through 2026-07-18 at daily grain; Huawei spans Jan–Jun 2023 at monthly grain (matching the real export it's modeled on). Adjust the resource count, base costs, FX rates, or add new anomaly scenarios as needed.

## Known limitations / what's next

- v1 only supports CSV import — no live API integration with any cloud provider (avoids credential handling and compliance risk, and keeps the demo account-free)
- The FX table only covers USD and AED today — adding another non-USD provider (e.g. Alibaba Cloud in CNY) means adding one more entry, not redesigning anything
- Anomaly detection currently only surfaces through the rule engine, not as an independent time-series anomaly view
- No multi-tenant / login system — single-session demo only
- A natural next step is lightweight forecasting from historical data (e.g. moving average or Prophet), extending into the "Operate" phase of the Inform → Optimize → Operate FinOps framework

## Project docs

- [`docs/prompt-library.md`](docs/prompt-library.md) — the AI Advisor's system prompt, example prompts by category, and an evaluation framework with an honest gap list
- [`docs/user-journey.md`](docs/user-journey.md) — a user journey map and a system-level conversation-flow diagram
- [`docs/demo-narrative.md`](docs/demo-narrative.md) — the script this project gets presented with, including anticipated interview questions

## About

Designed and built by [Vincie Pan](https://july44944.github.io/). Built on 8.5 years of work spanning Shenzhen and Abu Dhabi, most of it centered on cloud billing (BSS) system delivery and operational efficiency — including hands-on work with Huawei Cloud billing integration (HCIE-Cloud certified), which is why Huawei Cloud gets first-class support here rather than being an afterthought. This project is an attempt to combine that background with the methods learned during a Master's in Management Science and Data Analytics.
