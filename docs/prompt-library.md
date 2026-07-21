# Prompt library & evaluation notes — AI Cost Advisor

This documents the prompt design and evaluation thinking behind the opt-in **AI Cost Advisor** feature (`js/aiAdvisor.js`). It's written the way a product/AI-experience role would expect this kind of feature to be documented: not just "what prompt did you use," but why, what could go wrong, and how you'd know if it's working.

## System prompt

```text
You are a FinOps cost advisor embedded in a cloud cost dashboard.
Answer the user's question using ONLY the JSON cost data below — never invent a number that isn't in it.
If the data doesn't contain what's needed to answer, say so plainly instead of guessing.
Cite concrete figures (dollar amounts, resource IDs, percentages) from the data when relevant.
Keep answers to 3-6 sentences unless the user asks for a longer breakdown.

COST DATA:
{... compact JSON: totals, cost by provider/category, top 10 resources, the rule engine's suggestions ...}
```

**Design decisions, and why:**

| Decision | Reasoning |
|---|---|
| Ground the model in a **derived JSON summary**, not raw CSV rows | Keeps the prompt small and cheap; more importantly, the model can only reason about numbers the rule engine already computed and verified — it can't "discover" a cost trend on its own and get the math wrong. |
| Explicit "say so plainly instead of guessing" instruction | The single highest-value line in this prompt. Without it, a model asked "what's my Oracle Cloud spend?" on an AWS-only dataset will often produce a plausible-sounding fabricated number instead of "there's no Oracle Cloud data in this dataset." This is the one line most demos skip and most production incidents come from. |
| "Cite concrete figures" | Makes hallucination easier to *catch* even when it happens — a vague answer is harder to fact-check than one with a specific dollar amount or resource ID sitting right next to the source data. |
| Length cap ("3-6 sentences") | An interview/demo context rewards a scannable answer over an exhaustive one; also reduces token cost per turn. |
| No tool-use / function calling | Deliberately out of scope for v1 — the advisor is read-only and answers from a snapshot, it doesn't take actions (e.g. it can't actually terminate a resource). See "Handoff points" below for why that boundary matters. |

## Example prompts, by category

**Diagnostic** — reading the shape of the data
- "Why did cost go up between June and July?"
- "Which provider is the most expensive, and is that expected?"
- "What's driving the Compute category cost?"

**Prioritization** — turning suggestions into a to-do list
- "Which suggestion should I do first if I only have time for one this week?"
- "Rank these suggestions by effort vs. savings, not just savings."
- "If I fix everything except the tagging issue, what's my new total?"

**Explanation / stakeholder translation** — the "translate technical concepts into clear recommendations" ask from a Product role
- "Explain the commitment discount gap suggestion like I'm a finance stakeholder, not an engineer."
- "What does 'confidence: medium' actually mean for the oversized-compute suggestion?"

**Trustworthiness probes** — deliberately asking things the data can't answer, to check the model refuses correctly instead of guessing
- "What's my Oracle Cloud spend?" (no Oracle data in scope — correct answer is "not in this dataset")
- "What will my bill be next quarter?" (no forecasting in v1 — correct answer says so, doesn't extrapolate silently)
- "Which engineer owns the idle resources?" (data has no owner/person field, only team/project tags)

## Evaluation framework

This is the rubric this feature would be evaluated against, and today's honest status against each dimension:

| Dimension | What "good" looks like | Current status |
|---|---|---|
| **Accuracy** | Every number in the answer traces back to the JSON context | Enforced by the system prompt, not yet verified by an automated eval — see "Known gaps" |
| **Usefulness** | Answers actually help prioritize or explain, not just restate the dashboard | Reasonable for the diagnostic/prioritization categories above; weak for anything needing data outside scope (by design) |
| **Clarity** | A non-technical stakeholder can act on the answer | Length cap + "cite figures" instruction both push toward this; not yet tested with a non-technical reviewer |
| **Trustworthiness** | Refuses or flags when it doesn't know, rather than filling gaps | This is the one thing explicitly designed for (see trustworthiness probes above) |
| **Handoff points** | Clear about what it *can't* do (take action, forecast, identify a person) | No tool-use, no forecasting, no owner field — the absence is intentional, not an oversight, and is disclosed in this doc |
| **Adoption potential** | Would a real FinOps team actually turn this on | Untested — this is a demo, not a validated feature; opt-in design and the disclosure copy in the UI are the current proxy for "would someone trust this enough to flip the switch" |

## Known gaps (said out loud on purpose)

- No automated eval harness — accuracy is enforced by prompt instructions, not measured against a labeled test set. A real next step would be a small set of question/expected-answer pairs run against each model update.
- No conversation persistence — every reload starts fresh, which is fine for a demo but would need a decision (store where? whose data retention policy?) in production.
- Single provider (Anthropic) and no streaming — both are scope cuts for time, not architectural limits; the fetch call is isolated in one function (`askClaude` in `js/aiAdvisor.js`) specifically so either is a contained change.
