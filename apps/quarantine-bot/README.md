# Quarantine Bot

**Self-contained backend bot** that scans government data sources for active agricultural quarantine zones, uses Gemini AI for categorization, and directly syncs the data to the Supabase `quarantine_zones` table.

## Architecture & Deployment

This bot is deployed as a **GitHub Action Cron Job** (`.github/workflows/quarantine-bot.yml`).

It automatically runs at 10:00 AM, 2:00 PM, and 6:00 PM EST on weekdays. GitHub acts as the secure execution environment, downloading the latest code, fetching from external APIs, and pushing the finalized data straight to Supabase.

### Required Secrets
To run in GitHub Actions (or locally), the environment requires:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key to bypass RLS for UPSERTs
- `GEMINI_API_KEY`: API key for Google Gemini (used to categorize unknown pests)

## Local Development (Quick Start)

If you want to run it locally, create a `.env` file at the monorepo root or inject the env vars:

```bash
cd apps/quarantine-bot
yarn install
yarn start
```

It will sync to the database and optionally write debugging artifacts into `scripts/output/` if configured to do so.

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

## Execution Output

The bot inserts standard rows into the `quarantine_zones` table via the `sync_bot_quarantines` RPC. 
Additionally, it inserts a complete run log into the `quarantine_bot_health` table. If any fatal errors or severe schema drifts occur, it will trigger Edge Functions to automatically send warning push notifications and emails to administrators.
