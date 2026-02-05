# Ingesting Apify JSON Data

## Overview
This guide explains how to ingest real Apify API data into the dashboard.

## Backup
✅ **Test data has been backed up** to `raw_data_backup` table (200 records preserved)

## Endpoints

### 1. `/api/ingest-apify-json` (Recommended)
Ingests Apify JSON data directly.

**Request:**
```json
{
  "apify_data": [/* array of Apify ad objects */],
  "brand_name": "Headway App",  // Optional, will be extracted from data if not provided
  "ads_library_url": "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=250289965916061"  // Required
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/ingest-apify-json \
  -H "Content-Type: application/json" \
  -d @apify-data.json
```

## Data Transformation
The endpoint transforms Apify format to `raw_data` schema, creates/updates the brand, upserts into `raw_data`, and populates `brand_creative_summary` and `brand_funnel_summary` locally (no Edge Functions).

## Testing with Your Data

### Using curl

1. **Save your Apify JSON** to a file (e.g., `headway-data.json`)

2. **Create a request file** with the proper format:
```bash
# Create request.json
cat > request.json << EOF
{
  "apify_data": $(cat headway-data.json),
  "brand_name": "Headway App",
  "ads_library_url": "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=250289965916061"
}
EOF

# Send the request
curl -X POST http://localhost:3000/api/ingest-apify-json \
  -H "Content-Type: application/json" \
  -d @request.json
```

### Option 3: Direct API Call (for smaller datasets)

If your JSON array is small enough, you can POST directly:
```bash
curl -X POST http://localhost:3000/api/ingest-apify-json \
  -H "Content-Type: application/json" \
  -d '{"apify_data": [...your array...], "brand_name": "Headway App", "ads_library_url": "..."}'
```

## Verification

After ingestion:
1. Check the response for `recordsInserted` count
2. The brand should appear in the Creative Summary tab
3. Summary tables are automatically populated (may take a few seconds)

## Restoring Test Data

If you need to restore the backed-up test data:
```sql
-- Check backup
SELECT COUNT(*) FROM raw_data_backup;

-- Restore (if needed)
INSERT INTO raw_data 
SELECT * FROM raw_data_backup 
ON CONFLICT (id) DO NOTHING;
```

## Real brands from CSV (brandslinks.csv)

One **player** (column A) can have multiple **FB pages** (column B). The system stores one brand row per page, all with the same `brand_name` = Player. The UI aggregates by **Brand Name** so one player = one row.

### Seed brands from CSV

```bash
# Deactivate test brands and upsert real brands from brandslinks.csv
curl -X POST "http://localhost:3000/api/seed-brands-csv?replace_test=true"
```

### Scrape 300 creatives per page (Apify)

To run a test scrape with **300 creatives per page** (instead of full 12 months):

```bash
curl -X POST "http://localhost:3000/api/refresh-all-with-limit" \
  -H "Content-Type: application/json" \
  -d '{"limit_per_page": 300}'
```

This calls the ingest edge function for each active brand with `count: 300`. It can take several minutes if you have many brands. **The system enforces a maximum of 300 creatives per page** (edge function and this API cap at 300).

### End-of-month automation (marketing summary)

To run the creatives + funnel summary automatically at the end of each month:

1. **Cron or scheduler** (e.g. Vercel Cron, n8n, or system cron): call this endpoint once per month (e.g. last day of month):
   ```bash
   curl -X POST "https://<your-app>/api/refresh-all-with-limit" \
     -H "Content-Type: application/json" \
     -d '{"limit_per_page": 300}'
   ```
2. Ensure **APIFY_TOKEN** is set in Supabase Edge Function secrets and **NEXT_PUBLIC_SUPABASE_URL** / **NEXT_PUBLIC_SUPABASE_ANON_KEY** (or **SUPABASE_SERVICE_ROLE_KEY** for server-side) are set in your app env so the refresh can invoke the edge function.

### Export

- **Brand Name** in exports = Player (column A from CSV).
- Creative Summary and Funnel Summary aggregate by `brand_name`, so multiple FB pages under the same player appear as one row.

## Notes
- Duplicate `ad_archive_id` values are automatically skipped
- Data is inserted in batches of 100 to avoid timeouts
- Summary tables (`brand_creative_summary`, `brand_funnel_summary`) are updated automatically via Edge Functions
