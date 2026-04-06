# Quarantine Bot

**Self-contained backend bot** that scans government data sources for active agricultural quarantine zones and produces a CSV matching the `quarantine_zones` database schema.

## Quick Start

```bash
cd apps/quarantine-bot
yarn install
yarn start
```

Output lands in `scripts/output/`:
- `quarantine_YYYY-MM-DD_HHmmss.csv` — the quarantine data
- `health_YYYY-MM-DD_HHmmss.log` — source health + schema drift report

## Data Sources

| Source | Coverage | Reliability | Method |
|---|---|---|---|
| CDFA ArcGIS | California | HIGH | Public REST API (no auth) |
| USDA APHIS | National (6 pests) | MEDIUM | HTML scraping (cheerio) |
| State ArcGIS feeds | FL, TX, PA (configurable) | HIGH | Public REST API (no auth) |

## Adding a New State Feed

Edit `src/sources/state-feeds.config.json` — no code changes needed:

```json
{
  "state_code": "NY",
  "state_name": "New York",
  "endpoint_url": "https://services.arcgis.com/.../FeatureServer/0",
  "field_map": {
    "organism": "PEST_NAME",
    "status": "STATUS",
    "active_date": "START_DATE",
    "completed_date": "END_DATE",
    "project_name": "DESCRIPTION"
  },
  "active_status_value": "Active"
}
```

## Health Monitoring

The bot generates a health report every run. Key things it detects:

- **Schema drift**: Missing/renamed fields in ArcGIS APIs
- **Domain changes**: New organism types added to CDFA
- **Selector breakage**: APHIS HTML page restructuring
- **Record count anomalies**: Unexpectedly few/many results
- **Unknown organisms**: Pests that don't map to any CasaGrown category

If the health report shows 🔴 items, the bot's parsing code likely needs updating.

## CSV → Database Import (Future)

The CSV columns map to `quarantine_zones` table fields. To import:

1. Look up `state_id` from `states.code` = `state_code`
2. Look up `county_id` from `counties.name` = `county_name` + `state_id`
3. Look up `city_id` from `cities.name` = `city_name` (if present)
4. Insert using the `quarantine_zones` upsert constraint
