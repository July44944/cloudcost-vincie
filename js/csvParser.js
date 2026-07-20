/* CloudCostParser
 * Parses AWS CUR / Azure Cost Management / GCP Billing Export / Huawei Cloud
 * Resource Details (all simplified) CSVs, plus a generic unified template,
 * into one normalized row shape, always costed in USD:
 *
 * { date, provider, account, service, serviceCategory, region, resourceId,
 *   team, project, env, pricingModel, usageQty, usageUnit, cost, currency,
 *   originalCost, originalCurrency, utilizationPct, attached }
 */
(function (global) {

  const SERVICE_CATEGORY_RULES = [
    { category: 'Compute', keywords: ['ec2', 'virtual machine', 'vm', 'compute engine', 'gce', 'app service', 'function', 'lambda', 'cloud run', 'kubernetes', 'gke', 'aks', 'eks', 'container', 'compute', 'elastic cloud server', 'cloud server'] },
    { category: 'Storage', keywords: ['s3', 'storage', 'disk', 'blob', 'bucket', 'persistent disk', 'volume', 'image management'] },
    { category: 'Database', keywords: ['rds', 'sql', 'database', 'dynamodb', 'cosmos', 'cloud sql', 'firestore', 'aurora', 'relational database'] },
    { category: 'Analytics', keywords: ['bigquery', 'redshift', 'synapse', 'data factory', 'glue', 'databricks'] },
    { category: 'Network', keywords: ['network', 'cdn', 'load balancer', 'vpc', 'data transfer', 'elb', 'front door', 'cloud dns', 'bandwidth', 'virtual private cloud'] },
  ];

  // Fixed-peg / demo FX rates to USD, applied so multi-currency line items
  // can be summed and charted together. AED is pegged at 3.6725 (official
  // UAE Central Bank rate since 1997), so this isn't an approximation.
  const FX_TO_USD = { USD: 1, AED: 1 / 3.6725 };

  function mapServiceCategory(rawService) {
    const s = (rawService || '').toLowerCase();
    for (const rule of SERVICE_CATEGORY_RULES) {
      if (rule.keywords.some(k => s.includes(k))) return rule.category;
    }
    return 'Other';
  }

  function toNumber(v, fallback) {
    if (v === undefined || v === null || v === '') return fallback;
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
  }

  function toBoolOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    return String(v).trim().toLowerCase() === 'true';
  }

  function toDateStr(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const MONTH_ABBR = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

  // Huawei's "Billing Cycle" column reads like "Jan 2023" — a whole-month
  // billing period rather than a per-day line item.
  function parseBillingCycle(v) {
    const m = String(v || '').trim().match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
    if (!m) return null;
    const mon = MONTH_ABBR[m[1].toLowerCase()];
    return mon ? `${m[2]}-${mon}-01` : null;
  }

  function baseRow(fields) {
    const currency = (fields.currency || 'USD').toUpperCase();
    const rawCost = toNumber(fields.cost, null);
    const rate = FX_TO_USD[currency] ?? 1;
    const costUSD = rawCost === null ? null : rawCost * rate;

    const row = {
      date: toDateStr(fields.date),
      provider: fields.provider,
      account: fields.account || 'default',
      service: fields.service || 'Unknown',
      region: fields.region || 'unknown',
      resourceId: fields.resourceId || 'unknown-resource',
      team: (fields.team || '').trim(),
      project: (fields.project || '').trim(),
      env: (fields.env || '').trim(),
      pricingModel: (fields.pricingModel || 'on-demand').toLowerCase(),
      usageQty: toNumber(fields.usageQty, null),
      usageUnit: fields.usageUnit || '',
      cost: costUSD,
      currency: 'USD',
      originalCost: currency === 'USD' ? null : rawCost,
      originalCurrency: currency === 'USD' ? null : currency,
      utilizationPct: toNumber(fields.utilizationPct, null),
      attached: fields.attached === undefined ? null : toBoolOrNull(fields.attached),
    };
    row.serviceCategory = mapServiceCategory(row.service);
    row.taggedComplete = !!(row.team && row.project);
    return row;
  }

  // Each entry is a factory: (headerFields) => (row) => normalizedRow.
  // The factory step lets a format resolve header quirks once per file
  // instead of once per row — Huawei needs it because its cost column
  // name embeds the currency, e.g. "Payment Amount(AED)".
  const NORMALIZERS = {
    aws: () => (r) => baseRow({
      date: r['lineItem/UsageStartDate'],
      provider: 'aws',
      account: r['lineItem/UsageAccountId'],
      service: r['product/ProductName'],
      region: r['product/region'],
      resourceId: r['lineItem/ResourceId'],
      team: r['resourceTags/user:Team'],
      project: r['resourceTags/user:Project'],
      env: r['resourceTags/user:Env'],
      pricingModel: (r['pricing/term'] || '').toLowerCase() === 'reserved' ? 'reserved' : 'on-demand',
      usageQty: r['lineItem/UsageAmount'],
      usageUnit: r['pricing/unit'],
      cost: r['lineItem/UnblendedCost'],
      currency: r['lineItem/CurrencyCode'],
      utilizationPct: r['metric/AvgCPUUtilization'],
      attached: r['attribute/VolumeAttached'],
    }),

    azure: () => (r) => baseRow({
      date: r['Date'],
      provider: 'azure',
      account: r['SubscriptionId'],
      service: r['ServiceName'],
      region: r['ResourceLocation'],
      resourceId: r['ResourceId'],
      team: r['TagTeam'],
      project: r['TagProject'],
      env: r['TagEnv'],
      pricingModel: (r['ChargeType'] || '').toLowerCase() === 'reservation' ? 'reserved' : 'on-demand',
      usageQty: r['Quantity'],
      usageUnit: r['UnitOfMeasure'],
      cost: r['CostInBillingCurrency'],
      currency: r['BillingCurrencyCode'],
      utilizationPct: r['AvgCpuUtilization'],
      attached: r['VolumeAttached'],
    }),

    gcp: () => (r) => baseRow({
      date: r['usage_start_time'],
      provider: 'gcp',
      account: r['project_id'],
      service: r['service_description'],
      region: r['location_region'],
      resourceId: r['resource_name'],
      team: r['label_team'],
      project: r['label_project'],
      env: r['label_env'],
      pricingModel: (r['cost_type'] || '').toLowerCase().includes('committed') ? 'committed' : 'on-demand',
      usageQty: r['usage_amount'],
      usageUnit: r['usage_unit'],
      cost: r['cost'],
      currency: r['currency'],
      utilizationPct: r['utilization_pct'],
      attached: r['attached'],
    }),

    generic: () => (r) => baseRow({
      date: r['date'],
      provider: (r['provider'] || 'unknown').toLowerCase(),
      account: r['account'],
      service: r['service'],
      region: r['region'],
      resourceId: r['resource_id'],
      team: r['team'],
      project: r['project'],
      env: r['env'],
      pricingModel: r['pricing_model'],
      usageQty: r['usage_qty'],
      usageUnit: r['usage_unit'],
      cost: r['cost'],
      currency: r['currency'],
      utilizationPct: r['utilization_pct'],
      attached: r['attached'],
    }),

    // Huawei Cloud "Resource Details" bill export. Monthly grain (one row
    // per resource per Billing Cycle, not per day), and the payment column
    // name carries the settlement currency, e.g. "Payment Amount(AED)".
    huawei: (headerFields) => {
      const paymentKey = headerFields.find(k => /^Payment Amount\(/.test(k)) || headerFields.find(k => /^Amount\(/.test(k));
      const currencyMatch = paymentKey && paymentKey.match(/\(([^)]+)\)/);
      const currency = currencyMatch ? currencyMatch[1] : 'USD';
      return (r) => {
        const resourceId = [r['Resource ID'], r['Resource Name'], r['Offering Instance ID']]
          .map(v => (v || '').trim())
          .find(v => v.length > 0) || 'unknown-resource';
        const rawProject = (r['Enterprise Project Name'] || '').trim();
        const hasProject = rawProject && rawProject.toLowerCase() !== 'default';
        return baseRow({
          date: parseBillingCycle(r['Billing Cycle']),
          provider: 'huawei',
          account: r['Account Name'],
          service: r['Service Type Name'],
          region: r['Region Name'] || r['Region Code'],
          resourceId,
          // Huawei's export has no separate "team" tag, only an Enterprise
          // Project — and unassigned resources are labeled "default" rather
          // than left blank. Treat a non-default project as the attribution
          // signal for both team and project so the tag-governance rule
          // still means the same thing across providers.
          team: hasProject ? rawProject : '',
          project: hasProject ? rawProject : '',
          env: '',
          pricingModel: (r['Billing Mode'] || '').toLowerCase().includes('yearly') ? 'reserved' : 'on-demand',
          usageQty: r['Usage'],
          usageUnit: r['Usage Measure'],
          cost: paymentKey ? r[paymentKey] : null,
          currency,
          utilizationPct: r['Avg CPU Utilization'],
          attached: r['Volume Attached'],
        });
      };
    },
  };

  function detectFormat(headers) {
    const h = new Set(headers);
    if (h.has('lineItem/UnblendedCost')) return 'aws';
    if (h.has('CostInBillingCurrency')) return 'azure';
    if (h.has('provider') && h.has('resource_id')) return 'generic';
    if (h.has('usage_start_time') && h.has('cost')) return 'gcp';
    if (h.has('Enterprise Project ID') && h.has('Offering Instance ID')) return 'huawei';
    return null;
  }

  function parseCSVText(text) {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (!result.meta || !result.meta.fields) {
      throw new Error('Could not read a header row — please confirm this is a valid CSV file');
    }
    const format = detectFormat(result.meta.fields);
    if (!format) {
      throw new Error('Could not recognize this billing format — check the header row against the "CSV format guide" further down the page');
    }
    const normalizeRow = NORMALIZERS[format](result.meta.fields);
    const rows = [];
    const skipped = [];
    result.data.forEach((r, idx) => {
      const row = normalizeRow(r);
      if (row.date && row.cost !== null && !Number.isNaN(row.cost)) {
        rows.push(row);
      } else {
        skipped.push(idx + 2); // +2: header row + 1-index
      }
    });
    if (rows.length === 0) {
      throw new Error('Parsed 0 valid rows — check whether the date and cost fields are empty');
    }
    return { format, rows, skippedRowNumbers: skipped, totalRows: result.data.length };
  }

  global.CloudCostParser = { parseCSVText, mapServiceCategory };

})(window);
