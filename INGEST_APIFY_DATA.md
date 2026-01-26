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

### 2. `/api/ingest-full-apify`
Alternative endpoint that accepts the JSON array directly or wrapped in `data` field.

**Request:**
```json
[
  {/* Apify ad object 1 */},
  {/* Apify ad object 2 */},
  ...
]
```

Or:
```json
{
  "data": [/* array of Apify ad objects */],
  "brand_name": "Headway App",
  "ads_library_url": "..."
}
```

## Data Transformation
The endpoint automatically transforms Apify format to `raw_data` schema:
- Extracts `ad_archive_id`, `page_id`, `page_name` from ad object
- Extracts `link_url`, `caption`, `body.text` from `snapshot`
- Extracts media URLs from `snapshot.images` or `snapshot.videos`
- Converts Unix timestamps (`start_date`, `end_date`) to ISO dates
- Maps `display_format` (IMAGE → single_image, VIDEO → video, DPA/DCO → carousel)
- Creates/updates brand record
- Populates summary tables automatically

## Testing with Your Data

### Option 1: Using the Node.js Script (Recommended)

1. **Save your Apify JSON array** to a file (e.g., `headway-data.json`)
   - The file should contain a JSON array: `[{...}, {...}, ...]`

2. **Run the ingestion script:**
```bash
node scripts/ingest-headway-data.js headway-data.json
```

### Option 2: Using curl

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

## Notes
- Duplicate `ad_archive_id` values are automatically skipped
- Data is inserted in batches of 100 to avoid timeouts
- Summary tables (`brand_creative_summary`, `brand_funnel_summary`) are updated automatically via Edge Functions
