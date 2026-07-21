# Demo narrative

A script for presenting this project in an interview or informational chat — what to say, in what order, and why. Not meant to be memorized verbatim; meant to make sure the 5 minutes you get actually land on the points that matter.

## 30-second elevator pitch

> "Companies notice cloud cost problems reactively — the bill shows up, it's higher than expected, and someone has to figure out why. I built a tool that takes a billing export from AWS, Azure, GCP, or Huawei Cloud, normalizes it into one model, and surfaces both *what's* driving cost and *what to do about it* — ranked by estimated savings, with a rule engine that shows its work instead of being a black box. It's a static site with no backend, and it has an opt-in AI layer on top that answers follow-up questions grounded in the same numbers, not a hallucinated guess."

## Live demo script (~5-7 minutes)

1. **Open the live link, don't explain yet.** Click "Load multi-cloud sample." Let the dashboard populate. *"This is three cloud providers' billing data, normalized into one view."*
2. **Point at the KPI row.** *"Total spend, month-over-month change, and — this is the part that matters — estimated savings and untagged spend, computed from the data itself, not hardcoded."*
3. **Open one optimization suggestion.** Click to expand "steady, long-running workloads have no commitment discount." *"Every suggestion names the exact resources, not just 'reduce compute costs.' This one's savings estimate is a documented rule of thumb — ~30%, the commonly cited RI/Savings Plan discount tier — not a mystery number."*
4. **Switch to the Huawei Cloud sample.** *"Real billing exports aren't consistent — Huawei's is monthly, not daily, and settles in AED, not USD. The tool normalizes both a currency conversion and a different billing granularity so they're comparable — that's a real bug class if you get it wrong: sum AED and USD together without converting and your total is silently wrong."*
5. **Turn on the AI Cost Advisor, ask it a question.** *"This is off by default because it's the one feature that sends data anywhere — turning it on sends a compact summary, never raw rows, straight from the browser to Anthropic's API with your own key."* Ask: *"Which suggestion should I do first?"* Then ask something out of scope, e.g. *"What's my Oracle Cloud spend?"* to show it says "not in this dataset" instead of guessing.
6. **Close on the architecture, briefly.** *"No backend. Plain HTML/CSS/JS, deployed as a static GitHub Pages site. The CSV parser is a small factory pattern — adding a new cloud provider is one function, not a rewrite, which is how Huawei Cloud got added after the fact without touching the other three."*

## Anticipated questions, and prepared answers

**"Why rule-based instead of ML for the optimization suggestions?"**
> Because every number needs to be explainable to a finance stakeholder who didn't build the tool. A rule ("utilization under 5% → idle") is auditable in one sentence; a model's confidence score isn't. The AI layer sits *on top* of the rules for exactly this reason — it explains and prioritizes, it doesn't replace the deterministic part.

**"Why is the AI feature opt-in instead of just on?"**
> The rest of the tool's pitch is "your data never leaves the browser." Adding an always-on feature that quietly breaks that promise would be dishonest about what the tool does. Opt-in, explicit disclosure copy, and a visible toggle state are the minimum bar for that trade-off to be acceptable.

**"How would you evaluate whether the AI answers are actually good?"**
> Today it's enforced by prompt instructions (ground in the JSON, refuse if out of scope) with no automated eval — see `docs/prompt-library.md` for the honest gap list. A real next step is a small labeled set of question/expected-answer pairs, run against each model version before shipping an update.

**"What happens if someone tries to break it — bad CSV, wrong currency, missing fields?"**
> Malformed files fail with a specific error message, not a blank crash (tested with a deliberately broken CSV during development). Missing optional fields (utilization, tags) degrade gracefully — a resource without utilization data just doesn't trigger the idle/oversized rules, it doesn't throw.

**"How would this scale to a real enterprise account with millions of line items?"**
> It wouldn't, as-is — this parses everything client-side in memory, which is the right trade-off for a demo (zero infrastructure, zero data-handling liability) and the wrong one past a few hundred thousand rows. The honest answer is that a production version moves parsing/aggregation server-side and keeps the same rule-engine logic and UI.

## Personal narrative — why this project, specifically

Each feature maps to something real, not invented for the portfolio:

- **Multi-cloud billing normalization** ← delivering the BSS/billing platform for a cloud reseller in Abu Dhabi, where "the bill" was never one format
- **Huawei Cloud support, done properly (currency + granularity handling)** ← HCIE-Cloud certification and hands-on Huawei Cloud billing integration work, not a format picked off a popularity list
- **Rule-based optimization suggestions** ← reworking LTC/invoicing workflows, where the fix was never "run a model," it was "find the specific broken thing and name it"
- **The AI Advisor's trust boundaries (opt-in, grounded, refuses out-of-scope questions)** ← this is the newest piece, built specifically to demonstrate agentic-product thinking: not "add a chatbot," but "add exactly as much AI as the trust level of the feature can support"

## Tailoring note

- **For FinOps / Cloud Business Operations roles:** lead with steps 1-4 of the demo script and the rule-engine design decisions. The AI Advisor is a "we also considered the AI angle" closing beat, not the headline.
- **For AI Product / Agentic Systems roles:** lead with step 5 and `docs/prompt-library.md` / `docs/user-journey.md`. The rest of the tool is the credible, real-data foundation that makes the AI layer's trust boundaries mean something — it's not a chatbot bolted onto nothing.
