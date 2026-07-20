/* CloudCostRules
 * Aggregates normalized billing rows per resource and runs a small
 * rule library over them to produce ranked optimization suggestions.
 * Every rule is transparent about its assumption so the numbers are
 * defensible in a demo, not a black box.
 */
(function (global) {

  function aggregateByResource(rows) {
    const map = new Map();
    rows.forEach(r => {
      const key = r.provider + '|' + r.resourceId;
      if (!map.has(key)) {
        map.set(key, {
          resourceId: r.resourceId, provider: r.provider, service: r.service,
          serviceCategory: r.serviceCategory, region: r.region, account: r.account,
          team: r.team, project: r.project, env: r.env,
          pricingModel: r.pricingModel, attached: r.attached,
          totalCost: 0, days: 0, utilSum: 0, utilCount: 0,
        });
      }
      const agg = map.get(key);
      agg.totalCost += r.cost;
      agg.days += 1;
      if (r.utilizationPct !== null && r.utilizationPct !== undefined) {
        agg.utilSum += r.utilizationPct;
        agg.utilCount += 1;
      }
      if (r.attached !== null && r.attached !== undefined) agg.attached = r.attached;
      if (r.pricingModel) agg.pricingModel = r.pricingModel;
      if (r.team) agg.team = r.team;
      if (r.project) agg.project = r.project;
    });
    return Array.from(map.values()).map(a => ({
      ...a,
      avgUtilization: a.utilCount ? a.utilSum / a.utilCount : null,
    }));
  }

  function money(n) {
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function ruleIdleCompute(resources) {
    const hits = resources.filter(r => r.serviceCategory === 'Compute' && r.avgUtilization !== null && r.avgUtilization < 5);
    if (!hits.length) return null;
    const savings = hits.reduce((s, r) => s + r.totalCost, 0);
    return {
      id: 'idle-compute', category: 'optimize', severity: 'high',
      title: `${hits.length} compute resources are essentially idle`,
      description: 'Average CPU utilization is below 5% — usually a forgotten test box or a decommissioned service. Confirm ownership, then terminate. The fastest win on this list.',
      estSavings: savings, confidence: 'High',
      resources: hits.map(r => ({ id: r.resourceId, detail: `${r.provider.toUpperCase()} · ${r.service} · ${r.avgUtilization.toFixed(1)}% utilization`, cost: r.totalCost })),
    };
  }

  function ruleOversized(resources) {
    const hits = resources.filter(r => r.serviceCategory === 'Compute' && r.avgUtilization !== null && r.avgUtilization >= 5 && r.avgUtilization < 30);
    if (!hits.length) return null;
    const potential = hits.reduce((s, r) => s + r.totalCost, 0) * 0.4;
    return {
      id: 'oversized-compute', category: 'optimize', severity: 'mid',
      title: `${hits.length} compute resources look oversized`,
      description: 'Average utilization sits between 5%–30%. Downsizing to a smaller instance type is the usual fix. Savings are estimated from the rule of thumb that rightsizing typically cuts cost by ~40% — treat it as a working estimate, not a quote.',
      estSavings: potential, confidence: 'Medium',
      resources: hits.map(r => ({ id: r.resourceId, detail: `${r.provider.toUpperCase()} · ${r.service} · ${r.avgUtilization.toFixed(1)}% utilization`, cost: r.totalCost })),
    };
  }

  function ruleUnattachedStorage(resources) {
    const hits = resources.filter(r => r.serviceCategory === 'Storage' && r.attached === false);
    if (!hits.length) return null;
    const savings = hits.reduce((s, r) => s + r.totalCost, 0);
    return {
      id: 'unattached-storage', category: 'optimize', severity: 'high',
      title: `${hits.length} storage volumes are not attached to anything`,
      description: 'Volumes that stay unattached for a full billing cycle are almost always leftovers. Confirm nothing depends on them, then delete — or snapshot first if you want an archive.',
      estSavings: savings, confidence: 'High',
      resources: hits.map(r => ({ id: r.resourceId, detail: `${r.provider.toUpperCase()} · ${r.service}`, cost: r.totalCost })),
    };
  }

  function ruleCommitmentGap(resources, totalPeriods) {
    // "Steady workload" is relative to how many billing periods exist in the
    // dataset, not a fixed day count — a daily AWS export and a monthly
    // Huawei export need different absolute thresholds to mean the same thing.
    const minPeriods = Math.max(2, Math.ceil(totalPeriods * 0.5));
    const hits = resources.filter(r => r.serviceCategory === 'Compute' && r.pricingModel === 'on-demand' && r.days >= minPeriods);
    if (!hits.length) return null;
    const potential = hits.reduce((s, r) => s + r.totalCost, 0) * 0.3;
    return {
      id: 'commitment-gap', category: 'optimize', severity: 'mid',
      title: `${hits.length} steady, long-running workloads have no commitment discount`,
      description: 'These resources show up consistently across the dataset but are still billed on-demand — textbook candidates for a Reserved Instance / Savings Plan / Committed Use Discount. Savings are estimated at the commonly cited ~30% discount tier.',
      estSavings: potential, confidence: 'Medium',
      resources: hits.map(r => ({ id: r.resourceId, detail: `${r.provider.toUpperCase()} · ${r.service} · present in ${r.days}/${totalPeriods} billing periods`, cost: r.totalCost })),
    };
  }

  function ruleUntagged(resources) {
    const hits = resources.filter(r => !(r.team && r.project));
    if (!hits.length) return null;
    const cost = hits.reduce((s, r) => s + r.totalCost, 0);
    return {
      id: 'untagged-governance', category: 'governance', severity: 'mid',
      title: `${hits.length} resources are missing a team / project tag`,
      description: "These can't be attributed to a specific team or project, which throws off showback / chargeback. Treat this as a governance action item — it isn't counted toward direct savings.",
      estSavings: 0, confidence: '—', governanceCost: cost,
      resources: hits.map(r => ({ id: r.resourceId, detail: `${r.provider.toUpperCase()} · ${r.service}`, cost: r.totalCost })),
    };
  }

  function generateSuggestions(rows) {
    const resources = aggregateByResource(rows);
    const totalPeriods = new Set(rows.map(r => r.date)).size;
    const rules = [ruleIdleCompute, ruleOversized, ruleUnattachedStorage, r => ruleCommitmentGap(r, totalPeriods), ruleUntagged];
    const suggestions = rules.map(fn => fn(resources)).filter(Boolean);
    suggestions.sort((a, b) => b.estSavings - a.estSavings);
    return suggestions;
  }

  global.CloudCostRules = { aggregateByResource, generateSuggestions, money };

})(window);
