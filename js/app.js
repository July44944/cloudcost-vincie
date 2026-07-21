/* App orchestration: wiring UI events to parser / rules / charts modules. */
(function () {

  function fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function setStatus(msg, isErr) {
    const el = document.getElementById('fileStatus');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
  }

  function handleCSVText(text, sourceLabel) {
    try {
      const { format, rows, skippedRowNumbers, totalRows } = CloudCostParser.parseCSVText(text);
      const skippedNote = skippedRowNumbers.length ? ` · skipped ${skippedRowNumbers.length} rows (missing date or cost)` : '';
      setStatus(`✓ Loaded "${sourceLabel}" · detected as ${format.toUpperCase()} format · ${rows.length}/${totalRows} rows valid${skippedNote}`);
      renderDashboard(rows);
    } catch (e) {
      setStatus('✗ ' + e.message, true);
    }
  }

  function loadSample(provider) {
    setStatus('Loading sample data…');
    fetch(`data/sample-${provider}.csv`)
      .then(resp => { if (!resp.ok) throw new Error('Failed to load sample data'); return resp.text(); })
      .then(text => handleCSVText(text, `${provider.toUpperCase()} sample billing data`))
      .catch(e => setStatus('✗ ' + e.message, true));
  }

  function renderDashboard(rows) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    renderKPIs(rows);
    CloudCostCharts.renderAll(rows);
    renderSuggestions(rows);
    document.dispatchEvent(new CustomEvent('cloudcost:data-loaded', { detail: { rows } }));
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderKPIs(rows) {
    const total = rows.reduce((s, r) => s + r.cost, 0);
    document.getElementById('kpiTotal').textContent = fmtMoney(total);
    document.getElementById('kpiTotalSub').textContent =
      `${new Set(rows.map(r => r.date)).size} billing days · ${new Set(rows.map(r => r.provider)).size} cloud provider(s)`;

    const byMonth = new Map();
    rows.forEach(r => {
      const m = r.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) || 0) + r.cost);
    });
    const months = Array.from(byMonth.keys()).sort();
    const momEl = document.getElementById('kpiMom');
    const momSub = document.getElementById('kpiMomSub');
    if (months.length >= 2) {
      const last = byMonth.get(months[months.length - 1]);
      const prev = byMonth.get(months[months.length - 2]);
      const change = prev > 0 ? ((last - prev) / prev * 100) : 0;
      momEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(1) + '%';
      momEl.style.color = change > 0 ? 'var(--critical)' : 'var(--good)';
      momSub.textContent = `${months[months.length - 2]} → ${months[months.length - 1]}`;
    } else {
      momEl.textContent = '—';
      momEl.style.color = '';
      momSub.textContent = 'Not enough data for two full periods';
    }

    const resources = CloudCostRules.aggregateByResource(rows);
    const untaggedCost = resources.filter(r => !(r.team && r.project)).reduce((s, r) => s + r.totalCost, 0);
    document.getElementById('kpiUntagged').textContent = (total > 0 ? (untaggedCost / total * 100) : 0).toFixed(0) + '%';
  }

  function renderSuggestions(rows) {
    const suggestions = CloudCostRules.generateSuggestions(rows);
    const totalSavings = suggestions.reduce((s, x) => s + x.estSavings, 0);
    document.getElementById('kpiSavings').textContent = fmtMoney(totalSavings);
    document.getElementById('suggestionCount').textContent = suggestions.length;

    const list = document.getElementById('suggestionList');
    list.innerHTML = '';
    if (!suggestions.length) {
      list.innerHTML = '<p style="color:var(--ink-faint); font-size:14px;">No rules triggered on this dataset — cost governance looks healthy.</p>';
      return;
    }
    suggestions.forEach(s => {
      const el = document.createElement('div');
      el.className = 'suggestion';
      el.dataset.cat = s.category;
      const badgeClass = s.severity === 'high' ? 'badge-high' : s.severity === 'mid' ? 'badge-mid' : 'badge-low';
      const amount = s.category === 'governance' ? fmtMoney(s.governanceCost) : fmtMoney(s.estSavings);
      const amountLabel = s.category === 'governance' ? 'Governance risk amount' : 'Est. savings / full period';
      el.innerHTML = `
        <div class="suggestion-top">
          <div>
            <div class="suggestion-title-row">
              <span class="suggestion-title">${s.title}</span>
              <span class="badge ${badgeClass}">Confidence: ${s.confidence}</span>
            </div>
            <p class="suggestion-desc">${s.description}</p>
            <span class="suggestion-toggle">Show matched resources (${s.resources.length}) ▾</span>
          </div>
          <div>
            <div class="suggestion-savings">${amount}</div>
            <div class="suggestion-meta">${amountLabel}</div>
          </div>
        </div>
        <div class="suggestion-resources">
          ${s.resources.map(r => `<div><span>${r.id}</span><span>${r.detail} · ${fmtMoney(r.cost)}</span></div>`).join('')}
        </div>`;
      el.querySelector('.suggestion-top').addEventListener('click', () => el.classList.toggle('open'));
      list.appendChild(el);
    });
  }

  function wireSampleButtons() {
    document.querySelectorAll('[data-sample]').forEach(btn => {
      btn.addEventListener('click', () => loadSample(btn.dataset.sample));
    });
  }

  function wireUpload() {
    const input = document.getElementById('csvUpload');
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => handleCSVText(reader.result, file.name);
      reader.onerror = () => setStatus('✗ Failed to read file', true);
      reader.readAsText(file);
    });
  }

  function wireTemplateTabs() {
    document.querySelectorAll('.ttab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ttab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ttab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`[data-tpanel="${tab.dataset.ttab}"]`).classList.add('active');
      });
    });
  }

  function autoLoadFromQuery() {
    const requested = new URLSearchParams(window.location.search).get('sample');
    if (requested && ['aws', 'azure', 'gcp', 'huawei', 'multi'].includes(requested)) {
      loadSample(requested);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireSampleButtons();
    wireUpload();
    wireTemplateTabs();
    autoLoadFromQuery();
  });

})();
