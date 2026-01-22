# Edge Function Analysis - Large Dataset Handling

## Issue
API returns 2000-5000 records but Supabase doesn't write them all to `raw_data` table.

## Current Edge Function Implementation (`ingest_from_url`)

### Key Findings:

1. **Apify maxItems Limitation**
   - Line 50: `apifyInput.maxItems = 1000;` when using date-based fetch
   - **Problem**: If Apify returns more than 1000 items, only the first 1000 are processed
   - **Solution**: Increase maxItems or handle pagination

2. **Batch Insert Size**
   - Line 330: `const BATCH_SIZE = 100;`
   - **Current**: Inserts in batches of 100
   - **Potential Issue**: For 5000 records, this means 50 batch operations
   - **Recommendation**: Consider increasing to 200-500 for large datasets, but monitor timeout

3. **Verification Query Limitation**
   - Line 345: `.limit(Math.min(rows.length, 500));`
   - **Problem**: Only verifies first 500 rows, so for 5000 records, it might not catch all inserts
   - **Solution**: Remove limit or increase significantly

4. **Date Filtering**
   - Lines 80-90: Filters items by date after receiving from Apify
   - **Potential Issue**: If Apify returns items outside date range, they're filtered out
   - **Note**: This is correct behavior, but might explain why fewer records are inserted than received

5. **Fallback Date Handling**
   - Lines 120-140: Uses fallback dates if start_date is missing
   - **Good**: Ensures all ads get inserted even without dates
   - **Note**: This is working correctly

## Recommended Fixes

### 1. Increase Apify maxItems
```typescript
// Current (line 50)
apifyInput.maxItems = 1000;

// Recommended
apifyInput.maxItems = 5000; // Or higher based on Apify limits
```

### 2. Improve Verification
```typescript
// Current (line 345)
.limit(Math.min(rows.length, 500));

// Recommended
.limit(Math.min(rows.length, 10000)); // Or remove limit entirely
// Better: Count total instead of limiting
const { count } = await supabase
  .from("raw_data")
  .select("*", { count: "exact", head: true })
  .eq("brand_id", brand_id);
```

### 3. Increase Batch Size (with caution)
```typescript
// Current
const BATCH_SIZE = 100;

// Recommended (test first)
const BATCH_SIZE = 200; // Or 500 for very large datasets
// Note: Monitor for timeout issues
```

### 4. Add Better Logging
```typescript
// Add logging after each batch
console.log(`[INGEST] Batch ${i / BATCH_SIZE + 1}/${Math.ceil(rows.length / BATCH_SIZE)}: ${batch.length} rows`);
console.log(`[INGEST] Total inserted so far: ${totalInserted}/${rows.length}`);
```

### 5. Handle Apify Pagination (if needed)
If Apify supports pagination and returns more than maxItems, implement pagination logic.

## Mapping Verification

The `transformAdData` function correctly maps:
- ✅ All required fields (ad_archive_id, source, brand_id)
- ✅ Date handling with multiple fallbacks
- ✅ Media URLs from cards/videos/images
- ✅ Link URLs and CTAs
- ✅ Caption extraction from multiple sources
- ✅ JSONB fields (publisher_platform, page_categories)

**Mapping is correct** - the issue is likely in batch processing or verification.

## Test Data Status

✅ Test data inserted successfully:
- Test Brand 1: 121 ads (12 months)
- Test Brand 2: 96 ads (12 months)
- Total: 217 test records

UI should now display data. Summary tables need to be populated via Edge Functions.
