# Quick Start Guide - Import Your 4 JSON Files

## Step 1: Add Businesses

1. Open the dashboard at http://localhost:3000
2. Click **"Add Business"** button in the header
3. Add **"Holywater"** → Submit
4. Add **"JustDone"** → Submit

## Step 2: Import JSON Files

For each of your 4 JSON files:

1. Click **"Parse JSON"** button in the header
2. **Select the business**:
   - For Holywater files → Select "Holywater"
   - For JustDone files → Select "JustDone"
3. Click **"Choose File"** and select your JSON file
4. (Optional) Enter **Brand Name** if you want to override the auto-detected name
5. Click **"Parse & Import"**

### Expected Result:
- ✅ Success message showing:
  - Brand name (extracted from page_name in creatives)
  - Number of creatives received
  - Number of records inserted
  - Summary counts (creative & funnel)

## Step 3: View Data

1. **Toggle businesses** in the "Select Businesses" section to filter
2. Go to **Creative Summary** tab to see monthly creative counts
3. Go to **Funnel Summary** tab to see funnel URLs
4. Go to **Management** tab to see all businesses and their competitors

## Troubleshooting

**"No valid creatives found" error?**
- Make sure your JSON file is an array: `[{...}, {...}]`
- Or has a `creatives` property: `{creatives: [{...}, {...}]}`
- Each creative should have at least: `ad_archive_id` or `id` or `page_name`

**"Business not found" error?**
- Make sure you've added the business first (Step 1)

**No data showing after import?**
- Toggle the business ON in the "Select Businesses" section
- Check the Management tab to verify competitors were created
- Wait a few seconds for summaries to populate

## JSON File Format

Your Apify files should look like:
```json
[
  {
    "ad_archive_id": "123456789",
    "page_id": "987654321",
    "page_name": "Competitor Name",
    "start_date": "2024-01-01",
    "snapshot": {
      "page_name": "Competitor Name",
      "body": {"text": "Ad caption"},
      "link_url": "https://example.com",
      "cards": [...]
    }
  },
  ...
]
```

The system will automatically:
- Extract brand name from `page_name` in creatives
- Create a unique brand for each file
- Transform Apify format to database format
- Populate summary tables
