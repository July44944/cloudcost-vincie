/* CloudCostAdvisor
 * Opt-in conversational layer on top of the rule engine's output. Off by
 * default because it's the one feature that breaks the "nothing leaves
 * your browser" promise the rest of this tool makes: turning it on sends
 * a compact JSON summary (not raw rows) directly from the browser to
 * Anthropic's API, using a key the user supplies and that this app never
 * stores anywhere but sessionStorage (cleared when the tab closes).
 *
 * Design choices worth calling out (this is the "trustworthiness /
 * handoff points" surface of the feature):
 *  - The model only ever sees a derived summary — totals, breakdowns, and
 *    the suggestions the rule engine already produced — never the raw
 *    per-line-item rows. Smaller prompt, and it can't "discover" costs
 *    the rule engine didn't already surface.
 *  - The system prompt explicitly instructs the model to say when the
 *    data can't answer a question, rather than filling the gap with a
 *    plausible-sounding guess.
 *  - No conversation is persisted anywhere; reloading the page clears it.
 */
(function (global) {

  const ANTHROPIC_VERSION = '2023-06-01';
  let currentRows = null;
  let history = [];

  function $(id) { return document.getElementById(id); }

  function buildContext(rows) {
    const resources = CloudCostRules.aggregateByResource(rows);
    const total = rows.reduce((s, r) => s + r.cost, 0);
    const byProvider = {};
    const byCategory = {};
    rows.forEach(r => {
      byProvider[r.provider] = (byProvider[r.provider] || 0) + r.cost;
      byCategory[r.serviceCategory] = (byCategory[r.serviceCategory] || 0) + r.cost;
    });
    const topResources = [...resources].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10)
      .map(r => ({
        id: r.resourceId, provider: r.provider, service: r.service, category: r.serviceCategory,
        costUSD: round2(r.totalCost), pricingModel: r.pricingModel,
        avgUtilizationPct: r.avgUtilization === null ? null : round2(r.avgUtilization),
        tagged: !!(r.team && r.project),
      }));
    const suggestions = CloudCostRules.generateSuggestions(rows).map(s => ({
      title: s.title, category: s.category, estSavingsUSD: round2(s.estSavings),
      confidence: s.confidence, matchedResourceCount: s.resources.length,
      matchedResourceIds: s.resources.map(r => r.id),
    }));
    const dates = rows.map(r => r.date).sort();
    return {
      totalCostUSD: round2(total),
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      billingPeriods: new Set(dates).size,
      costByProviderUSD: mapRound(byProvider),
      costByServiceCategoryUSD: mapRound(byCategory),
      topResourcesByCost: topResources,
      optimizationSuggestions: suggestions,
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function mapRound(obj) {
    const out = {};
    Object.keys(obj).forEach(k => { out[k] = round2(obj[k]); });
    return out;
  }

  function systemPrompt(context) {
    return [
      'You are a FinOps cost advisor embedded in a cloud cost dashboard.',
      'Answer the user\'s question using ONLY the JSON cost data below — never invent a number that isn\'t in it.',
      'If the data doesn\'t contain what\'s needed to answer, say so plainly instead of guessing.',
      'Cite concrete figures (dollar amounts, resource IDs, percentages) from the data when relevant.',
      'Keep answers to 3-6 sentences unless the user asks for a longer breakdown.',
      '',
      'COST DATA:',
      JSON.stringify(context),
    ].join('\n');
  }

  async function askClaude(apiKey, model, context, question) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          system: systemPrompt(context),
          messages: [...history, { role: 'user', content: question }],
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Request timed out after 30s — check your network connection.');
      throw new Error('Network request failed — this can happen if the key is malformed or a browser extension is blocking the request.');
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch (e) { /* ignore */ }
      throw new Error(`API error ${res.status}${detail ? ': ' + detail : ''}`);
    }
    const data = await res.json();
    return (data.content && data.content[0] && data.content[0].text) || '(empty response)';
  }

  function appendMessage(role, text) {
    const log = $('aiLog');
    const el = document.createElement('div');
    el.className = `ai-msg ai-msg-${role}`;
    el.innerHTML = `<span class="ai-msg-role">${role === 'user' ? 'You' : 'Advisor'}</span><span class="ai-msg-text"></span>`;
    el.querySelector('.ai-msg-text').textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function setKeyStored(hasKey) {
    $('aiClearKey').classList.toggle('hidden', !hasKey);
  }

  function wire() {
    const toggle = $('aiToggle');
    const panel = $('aiPanel');
    const keyInput = $('aiKey');
    const modelInput = $('aiModel');
    const form = $('aiForm');
    const questionInput = $('aiQuestion');
    const clearKeyBtn = $('aiClearKey');
    const clearChatBtn = $('aiClearChat');

    const savedKey = sessionStorage.getItem('cloudcost_ai_key');
    if (savedKey) { keyInput.value = savedKey; setKeyStored(true); }

    toggle.addEventListener('change', () => {
      panel.classList.toggle('hidden', !toggle.checked);
    });

    keyInput.addEventListener('change', () => {
      if (keyInput.value.trim()) {
        sessionStorage.setItem('cloudcost_ai_key', keyInput.value.trim());
        setKeyStored(true);
      }
    });

    clearKeyBtn.addEventListener('click', () => {
      sessionStorage.removeItem('cloudcost_ai_key');
      keyInput.value = '';
      setKeyStored(false);
    });

    clearChatBtn.addEventListener('click', () => {
      history = [];
      $('aiLog').innerHTML = '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = questionInput.value.trim();
      if (!question) return;
      if (!currentRows) {
        appendMessage('assistant', 'Load a dataset first — there\'s nothing to analyze yet.');
        return;
      }
      const apiKey = keyInput.value.trim();
      if (!apiKey) {
        appendMessage('assistant', 'Add your Anthropic API key above first.');
        return;
      }
      const model = modelInput.value.trim() || 'claude-sonnet-5';

      appendMessage('user', question);
      questionInput.value = '';
      const pending = appendMessage('assistant', 'Thinking…');
      const submitBtn = form.querySelector('button');
      submitBtn.disabled = true;

      try {
        const context = buildContext(currentRows);
        const answer = await askClaude(apiKey, model, context, question);
        pending.querySelector('.ai-msg-text').textContent = answer;
        history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
      } catch (err) {
        pending.classList.add('ai-msg-error');
        pending.querySelector('.ai-msg-text').textContent = `✗ ${err.message}`;
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.addEventListener('cloudcost:data-loaded', (e) => {
      currentRows = e.detail.rows;
    });
  }

  document.addEventListener('DOMContentLoaded', wire);

  global.CloudCostAdvisor = { buildContext };

})(window);
