/**
 * Script to ingest the full Headway App Apify dataset
 * 
 * Usage:
 *   1. Save your Apify JSON to a file (e.g., headway-data.json)
 *   2. Run: node scripts/ingest-headway-data.js headway-data.json
 * 
 * Or paste the JSON array directly into the APIFY_DATA constant below
 */

const fs = require('fs');
const path = require('path');

// Read JSON from file if provided, otherwise use embedded data
const jsonFile = process.argv[2];

let apifyData;
if (jsonFile && fs.existsSync(jsonFile)) {
  console.log(`Reading data from ${jsonFile}...`);
  apifyData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
} else {
  console.log('No file provided. Please provide the JSON file path as argument.');
  console.log('Usage: node scripts/ingest-headway-data.js <path-to-json-file>');
  process.exit(1);
}

if (!Array.isArray(apifyData)) {
  console.error('Error: JSON must be an array of ad objects');
  process.exit(1);
}

console.log(`Found ${apifyData.length} ad records`);

// Extract brand info from first ad
const firstAd = apifyData[0];
const brandName = firstAd?.page_name || firstAd?.snapshot?.page_name || "Headway App";
const adsLibraryUrl = firstAd?.url || firstAd?.ad_library_url || 
  "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&view_all_page_id=250289965916061";

console.log(`Brand: ${brandName}`);
console.log(`Library URL: ${adsLibraryUrl}`);

// Ingest the data
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function ingest() {
  try {
    console.log(`\nIngesting data to ${baseUrl}/api/ingest-apify-json...`);
    
    const response = await fetch(`${baseUrl}/api/ingest-apify-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apify_data: apifyData,
        brand_name: brandName,
        ads_library_url: adsLibraryUrl,
      }),
    });

    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Ingestion failed:', data.error);
      if (data.errors) {
        console.error('Errors:', data.errors);
      }
      process.exit(1);
    }

    console.log('\n✅ Ingestion successful!');
    console.log(`   Brand ID: ${data.stats.brandId}`);
    console.log(`   Brand Name: ${data.stats.brandName}`);
    console.log(`   Records processed: ${data.stats.recordsProcessed}`);
    console.log(`   Records inserted: ${data.stats.recordsInserted}`);
    console.log(`   Records skipped: ${data.stats.recordsSkipped || 0}`);
    if (data.stats.errors > 0) {
      console.log(`   Errors: ${data.stats.errors}`);
    }
    console.log(`\n${data.note || 'Data should appear in the UI shortly.'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

ingest();
