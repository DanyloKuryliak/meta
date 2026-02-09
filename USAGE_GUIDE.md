# Meta Creatives Dashboard - Usage Guide

## Quick Start

1. **Add a Business**: Click "Add Business" button in the header → Enter business name → Submit
2. **Toggle Businesses**: Use the toggle switches in the "Select Businesses" section to filter competitors
3. **Add Competitor**: Click "Add Competitor" → Select business → Enter Ads Library URL → Submit
4. **Parse JSON File**: Click "Parse JSON" → Select business → Upload JSON file → Submit

## JSON File Format

Your JSON file should be in one of these formats:

### Format 1: Array of creatives
```json
[
  {
    "ad_archive_id": "123456",
    "page_id": "789",
    "page_name": "Competitor Name",
    "start_date": "2024-01-01",
    "snapshot": {
      "body": { "text": "Ad caption text" },
      "link_url": "https://example.com",
      "cards": [...]
    }
  },
  ...
]
```

### Format 2: Object with creatives array
```json
{
  "creatives": [
    {
      "ad_archive_id": "123456",
      "page_id": "789",
      "page_name": "Competitor Name",
      "start_date": "2024-01-01",
      "snapshot": {
        "body": { "text": "Ad caption text" },
        "link_url": "https://example.com",
        "cards": [...]
      }
    },
    ...
  ]
}
```

## Workflow for Marketing Team

### 1. Setting Up Businesses
- Add all Genesis businesses you want to track
- Each business will have its own set of competitors

### 2. Adding Competitors
**Option A: Via Ads Library URL**
- Click "Add Competitor"
- Select the business
- Paste the Meta Ads Library URL
- System fetches last 30 days of ads automatically

**Option B: Via JSON File**
- Click "Parse JSON"
- Select the business
- Upload your JSON file with creatives
- System parses and imports all creatives

### 3. Analyzing Data
- Toggle businesses on/off to filter competitors
- View **Creative Summary** tab for monthly creative counts
- View **Funnel Summary** tab for funnel URLs and domains
- Use filters, search, and sorting to analyze data
- Export data as CSV

### 4. Managing Data
- Go to **Management** tab
- View all businesses and their competitors
- See competitor status and last fetch dates
- Delete businesses (cascades to competitors)

## Features

✅ **Business Toggle**: Filter competitors by business  
✅ **Add Business**: Create new Genesis businesses  
✅ **Add Competitor**: Fetch from Ads Library URL  
✅ **Parse JSON**: Import creatives from JSON files  
✅ **Creative Summary**: Monthly creative counts by brand  
✅ **Funnel Summary**: Funnel URLs and domains analysis  
✅ **Export CSV**: Download data for analysis  
✅ **Auto-refresh**: Data updates every 15 seconds  
✅ **Management**: View and manage businesses/competitors  

## Edge Functions

All server-side logic runs in Supabase Edge Functions:

- `ingest_from_url`: Fetches ads from Apify using Ads Library URL
- `parse_json_creatives`: Parses JSON files and imports creatives
- `populate_summaries`: Aggregates raw_data into summary tables

## Troubleshooting

**Add Competitor not working?**
- Make sure you've selected a business
- Check that Ads Library URL is valid
- Verify APIFY_TOKEN is configured in Supabase

**JSON parsing fails?**
- Ensure JSON is valid format
- Check that creatives array is not empty
- Verify business_id is selected

**No data showing?**
- Toggle businesses on to filter
- Check Management tab to see if competitors exist
- Verify summaries were populated (check ingestion results)
