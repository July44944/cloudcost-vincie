/* CloudCostParser
 * Parses AWS CUR / Azure Cost Management / GCP Billing Export (simplified) CSVs,
 * plus a generic unified template, into one normalized row shape:
 *
 * { date, provider, account, service, serviceCategory, region, resourceId,
 *   team, project, env, pricingModel, usageQty, usageUnit, cost, currency,
 *   utilizationPct, attached }
 */
(function (global) {

  const SERVICE_CATEGORY_RULES = [
    { category: 'Compute', keywords: ['ec2', 'virtual machine', 'vm', 'compute engine', 'gce', 'app service', 'function', 'lambda', 'cloud run', 'kubernetes', 'gke', 'aks', 'eks', 'container', 'compute'] },
    { category: 'Storage', keywords: ['s3', 'storage', 'disk', 'blob', 'bucket', 'persistent disk'] },
    { category: 'Database', keywords: ['rds', 'sql', 'database', 'dynamodb', 'cosmos', 'cloud sql', 'firestore', 'aurora'] },
    { category: 'Analytics', keywords: ['bigquery', 'redshift', 'synapse', 'data factory', 'glue', 'databricks'] },
    { category: 'Network', keywords: ['network', 'cdn', 'load balancer', 'vpc', 'data transfer', 'elb', 'front door', 'cloud dns'] },
  ];

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
    // already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  function baseRow(fields) {
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
      cost: toNumber(fields.cost, null),
      currency: fields.currency || 'USD',
      utilizationPct: toNumber(fields.utilizationPct, null),
      attached: fields.attached === undefined ? null : toBoolOrNull(fields.attached),
    };
    row.serviceCategory = mapServiceCategory(row.service);
    row.taggedComplete = !!(row.team && row.project);
    return row;
  }

  const NORMALIZERS = {
    aws(r) {
      return baseRow({
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
      });
    },
    azure(r) {
      return baseRow({
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
      });
    },
    gcp(r) {
      return baseRow({
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
      });
    },
    generic(r) {
      return baseRow({
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
      });
    },
  };

  function detectFormat(headers) {
    const h = new Set(headers);
    if (h.has('lineItem/UnblendedCost')) return 'aws';
    if (h.has('CostInBillingCurrency')) return 'azure';
    if (h.has('provider') && h.has('resource_id')) return 'generic';
    if (h.has('usage_start_time') && h.has('cost')) return 'gcp';
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
    const normalizer = NORMALIZERS[format];
    const rows = [];
    const skipped = [];
    result.data.forEach((r, idx) => {
      const row = normalizer(r);
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
