# CloudCost Lens

A multi-cloud (AWS / Azure / GCP) billing visualization and optimization tool — pure front-end, zero backend, zero build step. Upload a billing CSV (or load a built-in sample dataset) and get a cost breakdown, trend view, and a ranked list of optimization suggestions.

**Live demo:** `https://july44944.github.io/cloudcost-vincie/` (replace with the real link once deployed)

---

## What this is

The first thing most companies notice after moving to the cloud isn't "this is convenient" — it's "why is the bill this high, and why is it such a mess." This tool tries to answer three questions:

1. **Where is the money going** — break down cost by provider, service, region, and tag, and see the trend over time
2. **Where is it being wasted** — a transparent rule library (not a black-box model) flags idle resources, oversized instances, unattached storage volumes, and long-running workloads with no commitment discount
3. **Who should own this cost** — aggregate spend by team / project tag and surface governance gaps

All parsing and computation happens in the browser: an uploaded CSV never leaves your machine, which is also why this can ship as a static site on GitHub Pages.

## Features

- **Smart CSV detection** — automatically recognizes simplified AWS CUR / Azure Cost Management / GCP Billing Export formats, plus a generic template, from the header row alone
- **Unified multi-cloud view** — all three billing formats are normalized into one data model before anything is charted, so you can compare providers directly
- **5 dashboard charts** — cost trend by provider, cost breakdown by service category, top 10 resources by cost, provider × pricing model, and tag governance coverage
- **Rule-driven optimization suggestions** — every suggestion names the exact resources it's based on, an estimated savings amount, and a confidence level — never just a vague tip
- **4 built-in sample datasets** — one each for AWS / Azure / GCP, plus a combined cross-cloud dataset that demonstrates the "unified view" differentiator directly

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

The "CSV format guide" section at the bottom of the page documents four recognizable header layouts:

- **Generic template** (recommended for your own data): `date, provider, account, service, region, resource_id, team, project, env, pricing_model, usage_qty, usage_unit, cost, currency, utilization_pct, attached`
- **AWS** — a simplified version of the core Cost & Usage Report fields
- **Azure** — a simplified version of the core Cost Management export fields
- **GCP** — a simplified version of the core BigQuery Billing Export fields

The three provider formats include two custom extension fields (`utilization_pct` / `attached`) that don't exist in a real billing export — in production these typically come from a join against CloudWatch / Azure Monitor / Cloud Monitoring. The demo bakes them straight into the sample CSVs to keep things simple.

## Optimization rule library

Every suggestion comes from a rule, not a trained model, so the reasoning behind each one is easy to explain out loud:

| Rule | Trigger condition | Savings estimate |
|---|---|---|
| Idle compute | Compute resource, average utilization < 5% | Full cost of the resource across the dataset |
| Oversized compute | Compute resource, average utilization 5%–30% | Total cost × 40% (rule of thumb: typical rightsizing savings) |
| Unattached storage | Storage resource, `attached = false` | Full cost of the resource across the dataset |
| Commitment discount gap | Compute resource, on-demand, present on ≥5 billing days | Total cost × 30% (rule of thumb: typical RI/Savings Plan/CUD discount tier) |
| Tag governance gap | Missing a team or project tag | Not counted toward savings — reported separately as a governance risk amount |

The 40% / 30% assumptions are themselves worth talking through in an interview — they're anchored to the discount ranges AWS/Azure/GCP publish for rightsizing and commitment discounts, not arbitrary numbers.

## Regenerating the sample data

The four CSVs under `data/` are generated by a script (fixed random seed, fully reproducible):

```bash
python3 scripts/generate_sample_data.py
```

The script defines 10 resources per provider (a mix of idle / normal / oversized / already-committed / untagged), spanning 2026-06-01 through 2026-07-18 — adjust the resource count, base costs, or add new anomaly scenarios as needed.

## Known limitations / what's next

- v1 only supports CSV import — no live API integration with any cloud provider (avoids credential handling and compliance risk, and keeps the demo account-free)
- Anomaly detection currently only surfaces through the rule engine, not as an independent time-series anomaly view
- No multi-tenant / login system — single-session demo only
- A natural next step is lightweight forecasting from historical data (e.g. moving average or Prophet), extending into the "Operate" phase of the Inform → Optimize → Operate FinOps framework

## About

Designed and built by [Vincie Pan](https://july44944.github.io/). Built on 8.5 years of work spanning Shenzhen and Abu Dhabi, most of it centered on cloud billing (BSS) system delivery and operational efficiency — this project is an attempt to combine that background with the methods learned during a Master's in Management Science and Data Analytics.
