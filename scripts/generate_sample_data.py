#!/usr/bin/env python3
"""Regenerates the demo billing CSVs under data/.

Each provider file uses that provider's (simplified) native export schema;
sample-multi.csv uses the generic unified template to demonstrate the
cross-cloud comparison view. Deterministic (fixed seed) so the numbers in
README screenshots stay stable across regenerations.

Usage: python3 scripts/generate_sample_data.py
"""
import csv
import datetime
import os
import random

random.seed(42)

START = datetime.date(2026, 6, 1)
END = datetime.date(2026, 7, 18)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

def daterange():
    d = START
    while d <= END:
        yield d
        d += datetime.timedelta(days=1)

TOTAL_DAYS = (END - START).days + 1

def jitter(base, pct=0.08):
    return max(0, base * (1 + random.uniform(-pct, pct)))

def drifted_cost(base, day_index, growth_ids, resource_id):
    cost = jitter(base)
    if resource_id in growth_ids:
        cost *= 1 + 0.35 * (day_index / TOTAL_DAYS)
    return round(cost, 4)

# id, service, region, team, project, env, term/chargeType/costType, base_cost, base_util(or None), attached(or None)
AWS_RESOURCES = [
    dict(id="i-0aws0000000web01", service="Amazon Elastic Compute Cloud", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=3.4, base_util=2.1, attached=None),
    dict(id="i-0aws0000000web02", service="Amazon Elastic Compute Cloud", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=18.2, base_util=64, attached=None),
    dict(id="i-0aws0000000batch3", service="Amazon Elastic Compute Cloud", region="us-west-2", team="data", project="etl", env="prod", term="OnDemand", base_cost=21.5, base_util=17, attached=None),
    dict(id="i-0aws0000000api04", service="Amazon Elastic Compute Cloud", region="us-east-1", team="platform", project="api", env="prod", term="Reserved", base_cost=14.1, base_util=71, attached=None),
    dict(id="i-0aws0000000legacy5", service="Amazon Elastic Compute Cloud", region="eu-west-1", team="", project="", env="", term="OnDemand", base_cost=2.3, base_util=1.4, attached=None),
    dict(id="vol-0awsorphan01", service="Amazon Elastic Block Store", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=4.1, base_util=None, attached=False),
    dict(id="vol-0awsactive02", service="Amazon Elastic Block Store", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=5.0, base_util=None, attached=True),
    dict(id="db-0awsprodrds01", service="Amazon Relational Database Service", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=28.4, base_util=None, attached=None),
    dict(id="s3-0awsassetsbucket", service="Amazon Simple Storage Service", region="us-east-1", team="platform", project="web", env="prod", term="OnDemand", base_cost=6.2, base_util=None, attached=None),
    dict(id="nat-0awsgateway01", service="Amazon Virtual Private Cloud", region="us-east-1", team="", project="", env="", term="OnDemand", base_cost=3.1, base_util=None, attached=None),
]

AZURE_RESOURCES = [
    dict(id="vm-azure-web-01", service="Virtual Machines", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=3.6, base_util=2.5, attached=None),
    dict(id="vm-azure-web-02", service="Virtual Machines", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=17.4, base_util=58, attached=None),
    dict(id="vm-azure-batch-03", service="Virtual Machines", region="westus2", team="data", project="etl", env="prod", term="Usage", base_cost=19.8, base_util=14, attached=None),
    dict(id="vm-azure-api-04", service="Virtual Machines", region="eastus", team="platform", project="api", env="prod", term="Reservation", base_cost=13.5, base_util=68, attached=None),
    dict(id="vm-azure-legacy-05", service="Virtual Machines", region="westeurope", team="", project="", env="", term="Usage", base_cost=2.1, base_util=1.8, attached=None),
    dict(id="disk-azure-orphan-01", service="Managed Disks", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=3.8, base_util=None, attached=False),
    dict(id="disk-azure-active-02", service="Managed Disks", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=4.6, base_util=None, attached=True),
    dict(id="sql-azure-prod-01", service="Azure SQL Database", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=26.1, base_util=None, attached=None),
    dict(id="blob-azure-assets", service="Storage Accounts (Blob)", region="eastus", team="platform", project="web", env="prod", term="Usage", base_cost=5.7, base_util=None, attached=None),
    dict(id="lb-azure-frontdoor-01", service="Azure Front Door", region="eastus", team="", project="", env="", term="Usage", base_cost=2.9, base_util=None, attached=None),
]

GCP_RESOURCES = [
    dict(id="vm-gcp-web-01", service="Compute Engine", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=3.2, base_util=2.0, attached=None),
    dict(id="vm-gcp-web-02", service="Compute Engine", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=16.9, base_util=60, attached=None),
    dict(id="vm-gcp-batch-03", service="Compute Engine", region="us-west1", team="data", project="etl", env="prod", term="regular", base_cost=20.6, base_util=20, attached=None),
    dict(id="vm-gcp-api-04", service="Compute Engine", region="us-central1", team="platform", project="api", env="prod", term="committed_use_discount", base_cost=13.8, base_util=75, attached=None),
    dict(id="vm-gcp-legacy-05", service="Compute Engine", region="europe-west1", team="", project="", env="", term="regular", base_cost=2.0, base_util=1.0, attached=None),
    dict(id="disk-gcp-orphan-01", service="Persistent Disk", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=3.5, base_util=None, attached=False),
    dict(id="disk-gcp-active-02", service="Persistent Disk", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=4.4, base_util=None, attached=True),
    dict(id="sql-gcp-prod-01", service="Cloud SQL", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=25.2, base_util=None, attached=None),
    dict(id="gcs-gcp-assets", service="Cloud Storage", region="us-central1", team="platform", project="web", env="prod", term="regular", base_cost=5.4, base_util=None, attached=None),
    dict(id="lb-gcp-frontend-01", service="Cloud Load Balancing", region="us-central1", team="", project="", env="", term="regular", base_cost=2.7, base_util=None, attached=None),
]

GROWTH_IDS = {"i-0aws0000000batch3", "vm-azure-batch-03", "vm-gcp-batch-03",
              "i-0aws0000000legacy5", "vm-azure-legacy-05", "vm-gcp-legacy-05"}

# Huawei Cloud's "Resource Details" export is monthly grain (one row per
# resource per Billing Cycle) and settles in AED for this account, unlike
# the daily/USD exports above — modeled on a real sample export, field
# structure only, no real customer or resource data reused.
HUAWEI_MONTHS = ["Jan 2023", "Feb 2023", "Mar 2023", "Apr 2023", "May 2023", "Jun 2023"]

HUAWEI_RESOURCES = [
    dict(id="ecs-idle-01", name="ecs-idle-01", service_code="hws.service.type.ec2", service="Elastic Cloud Server",
         rtype_code="hws.resource.type.vm", rtype="Cloud Host", offering="Normal|s6.large.2|2vCPUs|4GB|linux Ondemand",
         specs_code="s6.large.2.linux", specs_name="Normal|s6.large.2|2vCPUs|4GB|linux",
         region_code="ae-ad-1", region="UAE-Abu Dhabi", usage_type="Duration", usage_measure="Second",
         billing_mode="On Demand", project="web-platform", base_cost=200.0, base_util=1.8, attached=None),
    dict(id="ecs-web-02", name="ecs-web-02", service_code="hws.service.type.ec2", service="Elastic Cloud Server",
         rtype_code="hws.resource.type.vm", rtype="Cloud Host", offering="Normal|s6.large.4|2vCPUs|8GB|linux Ondemand",
         specs_code="s6.large.4.linux", specs_name="Normal|s6.large.4|2vCPUs|8GB|linux",
         region_code="ae-ad-1", region="UAE-Abu Dhabi", usage_type="Duration", usage_measure="Second",
         billing_mode="On Demand", project="web-platform", base_cost=2500.0, base_util=59, attached=None),
    dict(id="ecs-batch-03", name="ecs-batch-03", service_code="hws.service.type.ec2", service="Elastic Cloud Server",
         rtype_code="hws.resource.type.vm", rtype="Cloud Host", offering="Normal|s6.xlarge.4|4vCPUs|16GB|linux Ondemand",
         specs_code="s6.xlarge.4.linux", specs_name="Normal|s6.xlarge.4|4vCPUs|16GB|linux",
         region_code="ae-ad-1", region="UAE-Abu Dhabi", usage_type="Duration", usage_measure="Second",
         billing_mode="On Demand", project="data-etl", base_cost=3200.0, base_util=16, attached=None),
    dict(id="ecs-api-04", name="ecs-api-04", service_code="hws.service.type.ec2", service="Elastic Cloud Server",
         rtype_code="hws.resource.type.vm", rtype="Cloud Host", offering="Normal|s6.large.4|2vCPUs|8GB|linux Yearly/Monthly",
         specs_code="s6.large.4.linux", specs_name="Normal|s6.large.4|2vCPUs|8GB|linux",
         region_code="ae-ad-1", region="UAE-Abu Dhabi", usage_type="Duration", usage_measure="Second",
         billing_mode="Yearly/Monthly", project="web-platform", base_cost=2100.0, base_util=68, attached=None),
    dict(id="ecs-legacy-05", name="ecs-legacy-05", service_code="hws.service.type.ec2", service="Elastic Cloud Server",
         rtype_code="hws.resource.type.vm", rtype="Cloud Host", offering="Normal|s6.medium.2|1vCPUs|2GB|linux Ondemand",
         specs_code="s6.medium.2.linux", specs_name="Normal|s6.medium.2|1vCPUs|2GB|linux",
         region_code="ae-ad-1", region="UAE-Abu Dhabi", usage_type="Duration", usage_measure="Second",
         billing_mode="On Demand", project="default", base_cost=150.0, base_util=1.0, attached=None),
    dict(id="evs-orphan-01", name="evs-orphan-01", service_code="hws.service.type.ebs", service="Elastic Volume Service",
         rtype_code="hws.resource.type.volume", rtype="Elastic Volume Service", offering="High IO Ondemand",
         specs_code="SAS", specs_name="High IO", region_code="ae-ad-1", region="UAE-Abu Dhabi",
         usage_type="Duration", usage_measure="Second", billing_mode="On Demand", project="web-platform",
         base_cost=260.0, base_util=None, attached=False),
    dict(id="evs-active-02", name="evs-active-02", service_code="hws.service.type.ebs", service="Elastic Volume Service",
         rtype_code="hws.resource.type.volume", rtype="Elastic Volume Service", offering="High IO Ondemand",
         specs_code="SAS", specs_name="High IO", region_code="ae-ad-1", region="UAE-Abu Dhabi",
         usage_type="Duration", usage_measure="Second", billing_mode="On Demand", project="web-platform",
         base_cost=320.0, base_util=None, attached=True),
    dict(id="rds-prod-01", name="rds-prod-01", service_code="hws.service.type.rds", service="Relational Database Service",
         rtype_code="hws.resource.type.rds", rtype="Relational Database Service", offering="rds.pg.c6.large Ondemand",
         specs_code="rds.pg.c6.large", specs_name="rds.pg.c6.large|2vCPUs|8GB", region_code="ae-ad-1", region="UAE-Abu Dhabi",
         usage_type="Duration", usage_measure="Second", billing_mode="On Demand", project="web-platform",
         base_cost=4200.0, base_util=None, attached=None),
    dict(id="obs-assets-01", name="obs-assets-01", service_code="hws.service.type.obs", service="Object Storage Service",
         rtype_code="hws.resource.type.obs", rtype="Cloud Storage", offering="Object Storage Service Ondemand",
         specs_code="0", specs_name="Object Storage Service", region_code="ae-ad-1", region="UAE-Abu Dhabi",
         usage_type="size", usage_measure="GB", billing_mode="On Demand", project="web-platform",
         base_cost=480.0, base_util=None, attached=None),
    dict(id="bandwidth-01", name="ABGW-bandwidth-01", service_code="hws.service.type.vpc", service="Virtual Private Cloud",
         rtype_code="hws.resource.type.bandwidth", rtype="Bandwidth", offering="Dynamic BGP|Traffic Bandwidth Ondemand",
         specs_code="12_bgp", specs_name="Dynamic BGP|Traffic Bandwidth", region_code="ae-ad-1", region="UAE-Abu Dhabi",
         usage_type="upflow", usage_measure="Byte", billing_mode="On Demand", project="default",
         base_cost=210.0, base_util=None, attached=None),
]

HUAWEI_GROWTH_IDS = {"ecs-batch-03", "ecs-legacy-05"}

def write_aws():
    path = os.path.join(OUT_DIR, "sample-aws.csv")
    header = ["lineItem/UsageStartDate", "lineItem/UsageAccountId", "product/ProductName", "product/region",
              "lineItem/ResourceId", "resourceTags/user:Team", "resourceTags/user:Project", "resourceTags/user:Env",
              "pricing/term", "lineItem/UsageAmount", "pricing/unit", "lineItem/UnblendedCost",
              "lineItem/CurrencyCode", "metric/AvgCPUUtilization", "attribute/VolumeAttached"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for day_idx, d in enumerate(daterange()):
            for r in AWS_RESOURCES:
                cost = drifted_cost(r["base_cost"], day_idx, GROWTH_IDS, r["id"])
                util = round(jitter(r["base_util"], 0.18), 1) if r["base_util"] is not None else ""
                attached = "" if r["attached"] is None else str(r["attached"])
                qty, unit = (24, "Hrs") if "Compute" in r["service"] or "Relational" in r["service"] or "Virtual Private" in r["service"] else (100, "GB-Mo")
                w.writerow([d.isoformat(), "111122223333", r["service"], r["region"], r["id"],
                            r["team"], r["project"], r["env"], r["term"], qty, unit, cost, "USD", util, attached])

def write_azure():
    path = os.path.join(OUT_DIR, "sample-azure.csv")
    header = ["Date", "SubscriptionId", "ServiceName", "ResourceLocation", "ResourceId", "TagTeam", "TagProject",
              "TagEnv", "ChargeType", "Quantity", "UnitOfMeasure", "CostInBillingCurrency", "BillingCurrencyCode",
              "AvgCpuUtilization", "VolumeAttached"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for day_idx, d in enumerate(daterange()):
            for r in AZURE_RESOURCES:
                cost = drifted_cost(r["base_cost"], day_idx, GROWTH_IDS, r["id"])
                util = round(jitter(r["base_util"], 0.18), 1) if r["base_util"] is not None else ""
                attached = "" if r["attached"] is None else str(r["attached"])
                qty, unit = (24, "Hours") if r["service"] in ("Virtual Machines", "Azure SQL Database", "Azure Front Door") else (100, "GB-Month")
                w.writerow([d.isoformat(), "sub-8842-cost-demo", r["service"], r["region"], r["id"],
                            r["team"], r["project"], r["env"], r["term"], qty, unit, cost, "USD", util, attached])

def write_gcp():
    path = os.path.join(OUT_DIR, "sample-gcp.csv")
    header = ["usage_start_time", "project_id", "service_description", "location_region", "resource_name",
              "label_team", "label_project", "label_env", "cost_type", "usage_amount", "usage_unit", "cost",
              "currency", "utilization_pct", "attached"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for day_idx, d in enumerate(daterange()):
            for r in GCP_RESOURCES:
                cost = drifted_cost(r["base_cost"], day_idx, GROWTH_IDS, r["id"])
                util = round(jitter(r["base_util"], 0.18), 1) if r["base_util"] is not None else ""
                attached = "" if r["attached"] is None else str(r["attached"])
                qty, unit = (24, "hour") if r["service"] in ("Compute Engine", "Cloud SQL", "Cloud Load Balancing") else (100, "gibibyte month")
                w.writerow([d.isoformat(), "cost-demo-project", r["service"], r["region"], r["id"],
                            r["team"], r["project"], r["env"], r["term"], qty, unit, cost, "USD", util, attached])

def write_multi():
    """Generic-template file mixing a subset of resources from all three
    providers, to demonstrate the cross-cloud comparison view."""
    path = os.path.join(OUT_DIR, "sample-multi.csv")
    header = ["date", "provider", "account", "service", "region", "resource_id", "team", "project", "env",
              "pricing_model", "usage_qty", "usage_unit", "cost", "currency", "utilization_pct", "attached"]
    subsets = [
        ("aws", "111122223333", AWS_RESOURCES),
        ("azure", "sub-8842-cost-demo", AZURE_RESOURCES),
        ("gcp", "cost-demo-project", GCP_RESOURCES),
    ]
    term_map = {"OnDemand": "on-demand", "Reserved": "reserved", "Usage": "on-demand",
                "Reservation": "reserved", "regular": "on-demand", "committed_use_discount": "committed"}
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for day_idx, d in enumerate(daterange()):
            for provider, account, resources in subsets:
                for r in resources:
                    cost = drifted_cost(r["base_cost"], day_idx, GROWTH_IDS, r["id"])
                    util = round(jitter(r["base_util"], 0.18), 1) if r["base_util"] is not None else ""
                    attached = "" if r["attached"] is None else str(r["attached"])
                    w.writerow([d.isoformat(), provider, account, r["service"], r["region"], r["id"],
                                r["team"], r["project"], r["env"], term_map.get(r["term"], "on-demand"),
                                24, "unit", cost, "USD", util, attached])

def write_huawei():
    """Huawei Cloud Resource Details export — monthly grain, AED-settled,
    modeled on a real export's column structure with fictional resource and
    tenant data ("Contoso" placeholder, no real customer data)."""
    path = os.path.join(OUT_DIR, "sample-huawei.csv")
    header = ["Customer ID", "Account Name", "Billing Cycle", "Enterprise Project Name", "Enterprise Project ID",
              "Resource ID", "Resource Name", "Resource Tag", "Service Type Code", "Service Type Name",
              "Resource Type Code", "Resource Type Name", "Offering Instance ID", "Offering Instance Name",
              "Specifications Code", "Specifications Name", "Specifications Description", "Specifications Size",
              "Specifications Measure ID", "Specifications Measure Name", "Region Code", "Region Name",
              "Usage Type Code", "Usage", "Usage Measure", "Billing Mode", "Reservation Status",
              "Amount(AED)", "Test Coupon Used(AED)", "Consumption Payment(AED)", "Payment Amount(AED)",
              "Avg CPU Utilization", "Volume Attached"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for month_idx, cycle in enumerate(HUAWEI_MONTHS):
            for i, r in enumerate(HUAWEI_RESOURCES):
                cost = jitter(r["base_cost"])
                if r["id"] in HUAWEI_GROWTH_IDS:
                    cost *= 1 + 0.35 * (month_idx / len(HUAWEI_MONTHS))
                cost = round(cost, 4)
                util = round(jitter(r["base_util"], 0.18), 1) if r["base_util"] is not None else ""
                attached = "" if r["attached"] is None else str(r["attached"])
                reservation_status = "Reserved" if r["billing_mode"] == "Yearly/Monthly" else "Unreserved"
                offering_id = f"OFFI{535300000000000000 + i * 1000 + month_idx}"
                w.writerow([
                    "8f3c1a2b4e5d6f7a8b9c0d1e2f3a4b5c", "Contoso", cycle, r["project"], "0",
                    r["id"], r["name"], "", r["service_code"], r["service"], r["rtype_code"], r["rtype"],
                    offering_id, r["offering"], r["specs_code"], r["specs_name"], r["specs_name"], "", "", "",
                    r["region_code"], r["region"], r["usage_type"], 1, r["usage_measure"], r["billing_mode"],
                    reservation_status, cost, 0, cost, cost, util, attached,
                ])

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    write_aws()
    write_azure()
    write_gcp()
    write_multi()
    write_huawei()
    print("Sample CSVs written to", os.path.abspath(OUT_DIR))
