# Monthly Scraping Workflow

## Overview
This document verifies that the system can scrape data at the end of each month for specific brands, fetching only that month's creatives and adding them to Supabase.

## Required Supabase Edge Functions

### ✅ 1. `ingest_from_url`
**Purpose**: Fetches ads from Apify API for a specific date range and brand

**Parameters**:
- `ads_library_url` (required): Facebook Ad Library URL for the brand
- `brand_name` (optional): Brand name
- `start_date` (required): Start date in YYYY-MM-DD format
- `end_date` (required): End date in YYYY-MM-DD format
- `refresh_summaries` (optional): Boolean to auto-refresh summary tables

**Capabilities**:
- ✅ Supports date range filtering (start_date, end_date)
- ✅ Fetches from Apify API with date constraints
- ✅ Automatically creates/updates brand in `brands` table
- ✅ Inserts ads into `raw_data` table
- ✅ Handles duplicates via `ad_archive_id`
- ✅ Can auto-refresh summary tables

**Location**: Called via `/api/ingest` endpoint

### ✅ 2. `populate_creative_summary`
**Purpose**: Aggregates raw_data into monthly creative summaries

**Parameters**:
- `brand_id` (optional): Specific brand ID, or processes all brands if omitted

**Capabilities**:
- ✅ Aggregates by brand + month
- ✅ Calculates creatives_count and total_active_days
- ✅ Updates `brand_creative_summary` table

**Location**: Called via `/api/populate` endpoint

### ✅ 3. `populate_funnel_summary`
**Purpose**: Aggregates raw_data into monthly funnel summaries

**Parameters**:
- `brand_id` (optional): Specific brand ID, or processes all brands if omitted

**Capabilities**:
- ✅ Aggregates by brand + funnel URL + month
- ✅ Identifies funnel types (tracking_link, app_store, quiz_funnel, landing_page)
- ✅ Updates `brand_funnel_summary` table

**Location**: Called via `/api/populate` endpoint

### ✅ 4. `run_ingestion_for_all_brands`
**Purpose**: Batch processes all active brands

**Parameters**:
- `trailing_months` (optional): Number of months to fetch (default: 12)

**Capabilities**:
- ✅ Processes all brands with `is_active = true`
- ✅ Uses `last_fetched_date` to determine date ranges
- ✅ Ensures minimum of trailing 12 months

**Location**: Called via `/api/refresh-all` endpoint

## Monthly Scraping Workflow

### Step 1: Calculate Month Date Range
At the end of each month, calculate the first and last day of that month:

```javascript
function getMonthDateRange(year, month) {
  // month is 0-indexed (0 = January, 11 = December)
  const startDate = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDate = new Date(year, month, lastDay);
  
  return {
    start_date: startDate.toISOString().split('T')[0], // YYYY-MM-DD
    end_date: endDate.toISOString().split('T')[0]       // YYYY-MM-DD
  };
}

// Example: January 2026
const jan2026 = getMonthDateRange(2026, 0);
// Returns: { start_date: '2026-01-01', end_date: '2026-01-31' }
```

### Step 2: Scrape Data for Specific Brand and Month
Use the `/api/ingest` endpoint with the month's date range:

```bash
POST /api/ingest
{
  "ads_library_url": "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=250289965916061",
  "brand_name": "Headway App",
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "refresh_summaries": true
}
```

**What happens**:
1. Edge Function `ingest_from_url` is called
2. Apify API is queried with `start_date_min` and `start_date_max` set to the month range
3. Only ads from that month are fetched
4. Ads are inserted into `raw_data` table (duplicates skipped)
5. Summary tables are automatically refreshed

### Step 3: Verify Data
Check that data was inserted:

```sql
-- Check raw_data for the month
SELECT COUNT(*) 
FROM raw_data 
WHERE brand_id = '<brand_id>'
  AND start_date >= '2026-01-01'
  AND start_date <= '2026-01-31';

-- Check creative summary
SELECT * 
FROM brand_creative_summary 
WHERE brand_id = '<brand_id>'
  AND month = '2026-01';
```

## API Endpoints Available

### 1. `/api/ingest` - Scrape for Specific Brand and Date Range
**Use Case**: Monthly scraping for a specific brand

```typescript
POST /api/ingest
{
  ads_library_url: string,    // Required
  brand_name?: string,         // Optional
  start_date: string,          // Required: YYYY-MM-DD
  end_date: string,            // Required: YYYY-MM-DD
}
```

**Response**:
```json
{
  "success": true,
  "ingestion": {
    "inserted": 50,
    "ads_processed": 50
  },
  "summaries": {
    "creative_summary": { "inserted": 1 },
    "funnel_summary": { "inserted": 5 }
  }
}
```

### 2. `/api/populate` - Refresh Summary Tables
**Use Case**: Manually refresh summaries after ingestion

```typescript
POST /api/populate
{
  brand_id?: string  // Optional: specific brand, or all brands if omitted
}
```

### 3. `/api/refresh-all` - Refresh All Active Brands
**Use Case**: Batch process all brands (not for monthly scraping)

```typescript
POST /api/refresh-all
{
  trailing_months?: number  // Default: 12
}
```

## Automation Setup

### Option 1: Cron Job / Scheduled Task
Run at the end of each month (e.g., last day at 11:59 PM):

```bash
# Example cron job (runs on last day of month at 23:59)
59 23 28-31 * * [ "$(date -d tomorrow +\%d)" == "01" ] && curl -X POST http://your-domain/api/ingest -H "Content-Type: application/json" -d '{"ads_library_url": "...", "start_date": "...", "end_date": "..."}'
```

### Option 2: n8n / Zapier / Make.com
Create a workflow that:
1. Triggers on the last day of each month
2. Calculates the month's date range
3. Calls `/api/ingest` for each active brand
4. Logs results

### Option 3: Supabase Cron Jobs (pg_cron)
Set up a database function that runs monthly:

```sql
-- Create function to scrape current month for all brands
CREATE OR REPLACE FUNCTION scrape_current_month()
RETURNS void AS $$
DECLARE
  brand_record RECORD;
  month_start DATE;
  month_end DATE;
BEGIN
  -- Calculate current month
  month_start := DATE_TRUNC('month', CURRENT_DATE);
  month_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  
  -- Loop through all active brands
  FOR brand_record IN 
    SELECT id, brand_name, ads_library_url 
    FROM brands 
    WHERE is_active = true
  LOOP
    -- Call Edge Function via HTTP (requires http extension)
    PERFORM net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/ingest_from_url',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ANON_KEY'
      ),
      body := jsonb_build_object(
        'ads_library_url', brand_record.ads_library_url,
        'brand_name', brand_record.brand_name,
        'start_date', month_start::text,
        'end_date', month_end::text,
        'refresh_summaries', true
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule to run on last day of month at 11:59 PM
SELECT cron.schedule(
  'monthly-scrape',
  '59 23 28-31 * *',  -- Last day of month
  $$SELECT scrape_current_month()$$
);
```

## Verification Checklist

✅ **Edge Functions Exist**:
- [x] `ingest_from_url` - Supports date range filtering
- [x] `populate_creative_summary` - Aggregates monthly data
- [x] `populate_funnel_summary` - Aggregates funnel data
- [x] `run_ingestion_for_all_brands` - Batch processing

✅ **API Endpoints Available**:
- [x] `/api/ingest` - Accepts start_date and end_date
- [x] `/api/populate` - Refreshes summary tables
- [x] `/api/refresh-all` - Batch refresh (not needed for monthly)

✅ **Date Range Support**:
- [x] Edge Function accepts `start_date` and `end_date`
- [x] Apify API supports `start_date_min` and `start_date_max`
- [x] Data is filtered by date before insertion

✅ **Brand Management**:
- [x] Brands table exists with `is_active` flag
- [x] Brands can be created/updated automatically
- [x] `last_fetched_date` tracks when data was last fetched

✅ **Data Storage**:
- [x] `raw_data` table stores individual ads
- [x] `brand_creative_summary` aggregates by month
- [x] `brand_funnel_summary` aggregates funnels by month
- [x] Duplicate handling via `ad_archive_id`

## Example: Scraping January 2026 for Headway App

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "ads_library_url": "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=250289965916061",
    "brand_name": "Headway App",
    "start_date": "2026-01-01",
    "end_date": "2026-01-31",
    "refresh_summaries": true
  }'
```

**Expected Result**:
- Fetches only ads from January 1-31, 2026
- Inserts into `raw_data` (skips duplicates)
- Creates/updates "Headway App" brand
- Populates `brand_creative_summary` with January 2026 data
- Populates `brand_funnel_summary` with January 2026 funnels

## Notes

1. **No Old Data**: The system only fetches ads within the specified date range, so no historical data is scraped.

2. **Duplicate Handling**: If an ad already exists (same `ad_archive_id`), it's skipped. This means you can safely run monthly scraping multiple times.

3. **Summary Tables**: Summary tables are automatically refreshed after ingestion if `refresh_summaries: true` is set.

4. **Multiple Brands**: To scrape multiple brands, call `/api/ingest` once per brand, or use a loop in your automation.

5. **Error Handling**: If a brand doesn't exist, it's automatically created. If the date range has no ads, the function still succeeds (returns 0 inserted).

## Conclusion

✅ **All required functions exist and are properly configured**
✅ **The system supports monthly scraping with date range filtering**
✅ **No modifications needed - ready to use**

You can proceed with setting up monthly automation using any of the options above.
