# Meta Creatives Dashboard - System Overview

## Purpose
Marketing team tool to track competitor Meta Ads creatives and funnels for Genesis businesses. Fetches ads via **Apify**, stores data in **Supabase**, and the UI displays summaries filtered by selected businesses.

## Architecture

- **Supabase**: Database storage and Edge Functions for all server-side logic.
- **UI**: Reads from `brand_creative_summary` (Creative Summary tab) and `brand_funnel_summary` (Funnel Summary tab), filtered by selected businesses.
- **Ingestion**: All logic runs in Supabase Edge Functions. Uses Apify to fetch ads, writes to `brands` and `raw_data`, then populates summary tables.

## Database Tables

| Table | Purpose |
|------|--------|
| `businesses` | Genesis businesses that can be toggled on/off in UI |
| `brands` | Competitors to track; linked to `businesses` via `business_id` |
| `raw_data` | All ad rows from Apify; source `apify` or `json` |
| `brand_creative_summary` | **UI** – aggregated by brand + month + business_id (Creative Summary tab) |
| `brand_funnel_summary` | **UI** – aggregated by brand + funnel URL + month + business_id (Funnel Summary tab) |

## Supabase Edge Functions

- **`ingest_from_url`**: Fetches ads from Apify using Ads Library URL, creates/updates brand, inserts raw_data, and populates summaries. Requires `business_id`.
- **`populate_summaries`**: Rebuilds both summary tables for a brand or business. Filters by `business_id` when provided.
- **`parse_json_creatives`**: Parses ready JSON files with creatives for a business. Accepts `creatives` array, `business_id`, optional `brand_name` and `ads_library_url`.

## UI Features

- **Business Toggle**: Users can toggle businesses on/off to filter competitors
- **Add Competitor**: Form to add competitor with business selection
- **Creative Summary**: Shows creatives by brand + month, filtered by selected businesses
- **Funnel Summary**: Shows funnels by domain/URL, filtered by selected businesses

## Environment

See `env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Edge Functions use `APIFY_TOKEN` (configured in Supabase dashboard).

## Data Flow

1. User toggles businesses → UI filters summaries by `business_id`
2. User adds competitor → Calls `ingest_from_url` Edge Function → Fetches from Apify → Inserts raw_data → Populates summaries
3. User uploads JSON → Calls `parse_json_creatives` Edge Function → Parses JSON → Inserts raw_data → Populates summaries
4. UI refreshes summaries every 10-15 seconds via SWR
