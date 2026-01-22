# Meta Creatives Dashboard - System Overview

## Purpose
Marketing team tool to track competitor Meta Ads creatives and funnels. Automatically fetches and maintains data, provides insights for decision-making.

## Key Features

### 1. Add Competitor
- **Simple Form**: Just URL and brand name (optional)
- **Automatic Fetching**: System automatically fetches trailing 12 months on first add
- **Smart Updates**: Subsequent fetches only get new data (incremental)

### 2. Data Display
- **Last 12 Months**: All displays show last 12 months of data
- **Monthly Activity**: Visual bars showing 12 months of activity per brand
- **Date Range Filters**: Filter display by All Time, 7 days, 30 days, 90 days, or 12 months (viewing only)
- **Statistics**: Total, Avg/Month, Peak Month for each brand

### 3. Refresh All Brands
- **One-Click Refresh**: Button in Creative Summary tab
- **Incremental Updates**: Only fetches new data since last fetch for each brand
- **Maintains 12 Months**: Ensures trailing 12 months are always available
- **Auto-Updates**: Summary tables update automatically after refresh

### 4. Export
- **Last 12 Months CSV**: Exports all data from last 12 months
- **Dynamic Years**: Works for any year (2026, 2027, etc.)
- **Total Column**: Shows total for last 12 months period
- **No Hardcoded Dates**: All dates are calculated dynamically

## Data Architecture

### Database Tables

**`brands`**
- Tracks competitors
- `last_fetched_date`: Last date data was fetched (for incremental updates)
- `last_fetch_status`: success/error/pending
- `is_active`: true for brands to track

**`raw_data`**
- All ad data from Apify/Meta API
- Stores complete ad information
- Source field: "apify" or "meta" (for future)

**`brand_creative_summary`**
- Aggregated by brand + month
- Used for Creative Summary tab
- Auto-updated after each ingestion

**`brand_funnel_summary`**
- Aggregated by brand + funnel URL + month
- Used for Funnel Summary tab
- Auto-updated after each ingestion

### Smart Fetching Logic

1. **First Time Fetch**:
   - Fetches trailing 12 months from today
   - Sets `last_fetched_date` to today

2. **Subsequent Fetches**:
   - Fetches from `last_fetched_date + 1 day` to today
   - But ensures minimum of trailing 12 months (in case of gaps)
   - Updates `last_fetched_date` to today

3. **Result**:
   - Always maintains 12 months of data
   - Never re-fetches old data
   - Efficient API token usage

## API Support

### Current: Apify API
- Uses `curious_coder~facebook-ads-library-scraper`
- Date filtering via `start_date_min` and `start_date_max`
- Fetches all valuable fields (cta_text, media_url, etc.)

### Future: Meta API
- Ready for Meta API integration
- Same data transformation pipeline
- Just update `fetchAdsFromAPI()` function when available
- Supports `ad_delivery_date_min` and `ad_delivery_date_max`

## Automation

### Manual Refresh
- Click "Refresh All Brands" button in UI
- Fetches new data for all active brands
- Updates all summary tables

### Scheduled Automation (Recommended: n8n)
- Weekly/daily schedule
- Calls `run_ingestion_for_all_brands` edge function
- System handles date ranges automatically
- See `AUTOMATION_SETUP.md` for details

## UI Features

### Creative Summary Tab
- Top 5/10 Brands chart (line chart with legend)
- Monthly activity bars (12 months, hover for exact counts)
- Date range filter (display only)
- Export CSV (last 12 months)
- Search by brand name
- Sort by total, recent activity, or trend

### Funnel Summary Tab
- Search by brand name (not domain)
- Filter by date range
- Grouped by domain
- Expandable rows for paths
- Export CSV

## Best Practices

1. **Regular Refreshes**: Run weekly to keep data current
2. **Monitor Fetch Status**: Check `last_fetch_status` in database if issues
3. **Date Filters**: Use UI filters to focus on specific time periods
4. **Export Regularly**: Export CSV for backup/analysis

## Troubleshooting

- **No data showing**: Check if brands are `is_active = true`
- **Missing months**: Run refresh to fetch missing periods
- **Fetch errors**: Check `last_fetch_error` in brands table
- **Slow performance**: Consider filtering by date range in UI
