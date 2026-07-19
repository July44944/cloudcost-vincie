/* CloudCostCharts
 * Renders the five Chart.js visualizations from normalized billing rows.
 * Keeps chart instances around so re-loading a dataset destroys/rebuilds
 * cleanly instead of leaking canvases.
 */
(function (global) {

  const COLORS = {
    aws: '#F2A33C', azure: '#4CC3FF', gcp: '#5CD68B',
    accent: '#4CC3FF', money: '#F2B441', good: '#39D98A', critical: '#FF6B5E',
    ink: '#E7EDF2', inkSoft: '#93A4B3', line: 'rgba(147,164,179,0.12)', surface: '#10171F',
  };
  const CATEGORY_COLORS = { Compute: '#4CC3FF', Storage: '#5CD68B', Database: '#F2A33C', Analytics: '#B78CF0', Network: '#FF6B5E', Other: '#5E7080' };

  const instances = {};

  Chart.defaults.font.family = '"IBM Plex Mono", monospace';
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = COLORS.inkSoft;

  function destroy(key) {
    if (instances[key]) { instances[key].destroy(); delete instances[key]; }
  }

  function fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function groupSum(rows, keyFn) {
    const map = new Map();
    rows.forEach(r => {
      const k = keyFn(r);
      map.set(k, (map.get(k) || 0) + r.cost);
    });
    return map;
  }

  function renderTrend(rows) {
    destroy('trend');
    const dates = Array.from(new Set(rows.map(r => r.date))).sort();
    const providers = Array.from(new Set(rows.map(r => r.provider)));
    const datasets = providers.map(p => {
      const byDate = groupSum(rows.filter(r => r.provider === p), r => r.date);
      return {
        label: p.toUpperCase(),
        data: dates.map(d => +(byDate.get(d) || 0).toFixed(2)),
        borderColor: COLORS[p] || COLORS.accent,
        backgroundColor: (COLORS[p] || COLORS.accent) + '26',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
      };
    });
    const ctx = document.getElementById('trendChart');
    instances.trend = new Chart(ctx, {
      type: 'line',
      data: { labels: dates, datasets },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        stacked: true,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, boxHeight: 10, color: COLORS.inkSoft, font: { family: '"IBM Plex Sans"', size: 12 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { stacked: true, grid: { color: COLORS.line }, ticks: { callback: (v) => fmtMoney(v) } },
        },
      },
    });
  }

  function renderService(rows) {
    destroy('service');
    const byCat = groupSum(rows, r => r.serviceCategory);
    const labels = Array.from(byCat.keys());
    const data = labels.map(l => +byCat.get(l).toFixed(2));
    const ctx = document.getElementById('serviceChart');
    instances.service = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: labels.map(l => CATEGORY_COLORS[l] || COLORS.inkSoft), borderColor: COLORS.surface, borderWidth: 2 }] },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 9, boxHeight: 9, color: COLORS.inkSoft, font: { family: '"IBM Plex Sans"', size: 11.5 } } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtMoney(c.parsed)}` } },
        },
      },
    });
  }

  function renderTopResources(rows) {
    destroy('topResources');
    const resources = CloudCostRules.aggregateByResource(rows)
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .reverse();
    const ctx = document.getElementById('topResourcesChart');
    instances.topResources = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: resources.map(r => r.resourceId),
        datasets: [{
          data: resources.map(r => +r.totalCost.toFixed(2)),
          backgroundColor: resources.map(r => (COLORS[r.provider] || COLORS.accent)),
          borderRadius: 4, barThickness: 14,
        }],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmtMoney(c.parsed.x) } } },
        scales: {
          x: { grid: { color: COLORS.line }, ticks: { callback: (v) => fmtMoney(v) } },
          y: { grid: { display: false }, ticks: { font: { size: 10.5 } } },
        },
      },
    });
  }

  function renderPricingModel(rows) {
    destroy('pricingModel');
    const providers = Array.from(new Set(rows.map(r => r.provider)));
    const models = Array.from(new Set(rows.map(r => r.pricingModel)));
    const modelColors = { 'on-demand': COLORS.critical, reserved: COLORS.good, committed: COLORS.good, spot: COLORS.accent };
    const datasets = models.map(m => ({
      label: m,
      data: providers.map(p => {
        const sum = rows.filter(r => r.provider === p && r.pricingModel === m).reduce((s, r) => s + r.cost, 0);
        return +sum.toFixed(2);
      }),
      backgroundColor: modelColors[m] || COLORS.inkSoft,
      borderRadius: 4,
    }));
    const ctx = document.getElementById('pricingModelChart');
    instances.pricingModel = new Chart(ctx, {
      type: 'bar',
      data: { labels: providers.map(p => p.toUpperCase()), datasets },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 9, boxHeight: 9, color: COLORS.inkSoft, font: { family: '"IBM Plex Sans"', size: 11.5 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(c.parsed.y)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, grid: { color: COLORS.line }, ticks: { callback: (v) => fmtMoney(v) } },
        },
      },
    });
  }

  function renderTagCoverage(rows) {
    destroy('tagCoverage');
    const resources = CloudCostRules.aggregateByResource(rows);
    const tagged = resources.filter(r => r.team && r.project).reduce((s, r) => s + r.totalCost, 0);
    const untagged = resources.filter(r => !(r.team && r.project)).reduce((s, r) => s + r.totalCost, 0);
    const ctx = document.getElementById('tagCoverageChart');
    instances.tagCoverage = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Tagged', 'Untagged'],
        datasets: [{ data: [+tagged.toFixed(2), +untagged.toFixed(2)], backgroundColor: [COLORS.good, COLORS.critical], borderColor: COLORS.surface, borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 9, boxHeight: 9, color: COLORS.inkSoft, font: { family: '"IBM Plex Sans"', size: 11.5 } } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${fmtMoney(c.parsed)}` } },
        },
      },
    });
  }

  function renderAll(rows) {
    renderTrend(rows);
    renderService(rows);
    renderTopResources(rows);
    renderPricingModel(rows);
    renderTagCoverage(rows);
  }

  global.CloudCostCharts = { renderAll };

})(window);
