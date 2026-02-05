# ingest_from_url

Edge function that fetches ads from Apify (Facebook Ads Library Scraper) and writes them to Supabase `raw_data`.

## Deploy

From project root, with [Supabase CLI](https://supabase.com/docs/guides/cli) and logged in (`supabase login`):

```bash
supabase functions deploy ingest_from_url --project-ref <your-project-ref>
```

Or with npm: `npx supabase functions deploy ingest_from_url --project-ref <your-project-ref>`

Secrets (APIFY_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) must be set in the project's Edge Function secrets.

## Apify payload mapping

- **Cards (DCO/carousel)**: Uses first card’s `video_hd_url` / `video_sd_url` / `video_preview_image_url` or image URLs, and `link_url`.
- **Dates**: `start_date` / `end_date` (Unix seconds) → ISO string for DB.
- **end_date** in DB is text (YYYY-MM-DD).
- Errors are serialized so the API never returns `[object Object]`.
