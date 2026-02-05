# Meta Creatives Dashboard - System Overview

## Purpose
Marketing team tool to track competitor Meta Ads creatives and funnels. Fetches ads via **Meta Ads Library API** (or optionally Apify), stores data in **Supabase**, and the UI displays summaries from two summary tables.

## Architecture

- **Supabase**: Storage only. Four tables: `brands`, `raw_data`, `brand_creative_summary`, `brand_funnel_summary`.
- **UI**: Reads only `brand_creative_summary` (Creative Summary tab) and `brand_funnel_summary` (Funnel Summary tab).
- **Ingestion**: Runs in the Next.js app (no Supabase Edge Functions). Uses Meta Graph API `ads_archive` when `META_ACCESS_TOKEN` is set, otherwise Apify. Writes to `brands` and `raw_data`, then runs local summary population into the two summary tables.

## Database Tables

| Table | Purpose |
|------|--------|
| `brands` | Competitors to track; `ads_library_url`, `last_fetched_date`, `last_fetch_status` |
| `raw_data` | All ad rows from Meta/Apify; source `meta` or `apify` |
| `brand_creative_summary` | **UI** – aggregated by brand + month (Creative Summary tab) |
| `brand_funnel_summary` | **UI** – aggregated by brand + funnel URL + month (Funnel Summary tab) |

## Ingestion (Local)

- **Meta API** (`lib/meta-ads-api.ts`): Fetches from Graph API `ads_archive` using `search_page_ids` (from `ads_library_url`) and `ad_delivery_date_min` / `ad_delivery_date_max`.
- **Apify** (optional): Same as former edge function logic; used when `META_ACCESS_TOKEN` is not set and `APIFY_TOKEN` is set.
- **Flow**: `/api/ingest` or `/api/refresh-all-with-limit` → fetch ads → transform → upsert `raw_data` → update `brands` → populate `brand_creative_summary` and `brand_funnel_summary` via `lib/populate-summaries.ts`.

## API Routes (Kept)

- `POST /api/ingest` – Ingest one brand (Meta or Apify); body: `ads_library_url`, optional `brand_name`, `start_date`, `end_date`, `count`, `source` (`meta` | `apify`).
- `POST /api/refresh-all-with-limit` – Refresh all active brands (uses local ingest).
- `POST /api/populate` – Rebuild summary tables for one brand or all (body: optional `brand_id`).
- `POST /api/populate-all-brands` – Populate summaries for all active brands.
- `POST /api/ingest-apify-json` – Ingest raw Apify JSON array; body: `apify_data`, `brand_name`, `ads_library_url`.
- `POST /api/seed-brands-csv` – Seed brands from CSV.

## Environment

See `env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. For ingestion: `META_ACCESS_TOKEN` (preferred) or `APIFY_TOKEN`.

## UI

- **Creative Summary**: Last 12 months, monthly bars, date filters, export CSV, search/sort.
- **Funnel Summary**: By domain/URL, date range, expandable rows, export CSV.
