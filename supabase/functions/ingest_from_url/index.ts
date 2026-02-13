// ingest_from_url - Fetches creatives from Apify and ingests into raw_data.
// Deploy with: supabase functions deploy ingest_from_url --no-verify-jwt
// The Next.js API verifies the user and passes user_id in the body.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const MAX_CREATIVES = 25000;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(date: Date | string): string {
  if (typeof date === "string") return date;
  return date.toISOString().split("T")[0];
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function generateUUID(): string {
  return crypto.randomUUID();
}

async function fetchAdsFromApify(
  adsLibraryUrl: string,
  options: { start_date?: string; end_date?: string; count?: number }
): Promise<any[]> {
  const apifyToken = Deno.env.get("APIFY_TOKEN");
  if (!apifyToken) throw new Error("APIFY_TOKEN not configured");

  // Apify uses limitPerSource (per URL) and count (total). maxItems is ignored.
  const apifyInput: any = {
    scrapeAdDetails: false,
    scrapePageAds: {
      activeStatus: "all",
      countryCode: "ALL",
      sortBy: "most_recent",
    },
    urls: [{ url: adsLibraryUrl }],
  };

  if (options.count && options.count > 0) {
    const limit = Math.min(MAX_CREATIVES, options.count);
    apifyInput.limitPerSource = limit;
    apifyInput.count = limit;
  } else if (options.start_date && options.end_date) {
    apifyInput.start_date_min = options.start_date;
    apifyInput.start_date_max = options.end_date;
    apifyInput.limitPerSource = 5000;
    apifyInput.count = 5000;
  } else {
    apifyInput.limitPerSource = 500;
    apifyInput.count = 500;
  }

  const apifyRes = await fetch(
    "https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apifyInput),
    }
  );

  if (!apifyRes.ok) {
    const text = await apifyRes.text();
    throw new Error(`Apify error: ${apifyRes.status} - ${text.substring(0, 500)}`);
  }

  const items = await apifyRes.json();
  if (!Array.isArray(items)) throw new Error("Apify response is not an array");

  const cap = options.count && options.count > 0 ? Math.min(MAX_CREATIVES, options.count) : undefined;
  let filtered = items;
  if (cap) {
    filtered = items.slice(0, cap);
  } else if (options.start_date && options.end_date) {
    const startDate = new Date(options.start_date);
    const endDate = new Date(options.end_date);
    endDate.setHours(23, 59, 59, 999);
    filtered = items.filter((item: any) => {
      if (!item.start_date) return false;
      const itemDate = new Date(typeof item.start_date === "number" ? item.start_date * 1000 : item.start_date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }
  return filtered;
}

function transformAdData(ad: any, brandId: string, source: string): any {
  const snapshot = ad.snapshot || {};
  let startDate: Date | null = null;
  if (ad.start_date) {
    const ts = typeof ad.start_date === "number" ? ad.start_date : parseInt(String(ad.start_date));
    if (!isNaN(ts) && ts > 0) {
      startDate = new Date(ts * 1000);
      if (isNaN(startDate.getTime())) startDate = null;
    }
  }
  if (!startDate || isNaN(startDate.getTime())) startDate = new Date();

  let endDate: string | null = null;
  if (ad.end_date) {
    const ts = typeof ad.end_date === "number" ? ad.end_date : parseInt(String(ad.end_date));
    if (!isNaN(ts) && ts > 0) {
      const d = new Date(ts * 1000);
      if (!isNaN(d.getTime())) endDate = formatDate(d);
    }
  }

  let linkUrl = snapshot.link_url || null;
  if (!linkUrl && snapshot.cards?.[0]?.link_url) linkUrl = snapshot.cards[0].link_url;
  const caption = snapshot.caption || null;
  const pageName = snapshot.page_name || ad.page_name || null;
  let adArchiveId = String(ad.ad_archive_id || ad.id || "");
  if (!adArchiveId || adArchiveId === "undefined" || adArchiveId === "null" || adArchiveId === "") adArchiveId = generateUUID();
  const adLibraryUrl = ad.url || ad.ad_library_url || null;

  return {
    brand_id: brandId,
    ad_archive_id: adArchiveId,
    source,
    ad_library_url: adLibraryUrl,
    page_id: String(ad.page_id || snapshot.page_id || ""),
    page_name: pageName,
    start_date: startDate.toISOString(),
    end_date: endDate,
    link_url: linkUrl,
    caption: caption,
  };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ success: false, error: { message: "POST only" } }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return jsonResponse({ success: false, error: { message: "Server misconfigured" } }, 500);

    const body = (await req.json().catch(() => ({}))) as Json;
    const adsLibraryUrl = typeof body.ads_library_url === "string" ? body.ads_library_url : undefined;
    const brandNameInput = typeof body.brand_name === "string" ? body.brand_name : undefined;
    const businessId = typeof body.business_id === "string" ? body.business_id : undefined;
    const userIdFromBody = typeof body.user_id === "string" ? body.user_id : null;
    const rawCount = typeof body.count === "number" ? body.count : typeof body.count === "string" ? parseInt(body.count) : 500;
    const count = rawCount != null && !isNaN(rawCount) && rawCount > 0 ? Math.min(MAX_CREATIVES, Math.floor(rawCount)) : 500;
    const refreshSummaries = body.refresh_summaries !== false;

    if (!userIdFromBody) return jsonResponse({ success: false, error: { message: "user_id is required" } }, 400);
    const userId = userIdFromBody;

    if (!adsLibraryUrl) throw new Error("ads_library_url is required");
    if (!businessId) throw new Error("business_id is required");
    try {
      new URL(adsLibraryUrl);
    } catch {
      throw new Error("Invalid ads_library_url");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, business_name, user_id, is_shared")
      .eq("id", businessId)
      .single();
    if (businessError || !business) throw new Error("Business not found");

    const { data: profile } = await supabase.from("user_profiles").select("is_admin").eq("id", userId).maybeSingle();
    const isAdmin = Boolean((profile as any)?.is_admin);
    if (!isAdmin && !business.is_shared && (business as any).user_id !== userId) {
      return jsonResponse({ success: false, error: { message: "Access denied to this business" } }, 403);
    }

    // Fetch from Apify first so we can use real page_name for brand when not provided
    const items = await fetchAdsFromApify(adsLibraryUrl, { count });
    const adItems = items.filter((x: any) => x && (x.ad_archive_id || x.id) && !x.errorCode && !x.error);

    // Brand name: use input, or first ad's page_name from Apify, or Page {id} from URL as last resort
    let extractedName = "Unknown Brand";
    if (!brandNameInput?.trim()) {
      if (adItems.length > 0) {
        const first = adItems[0];
        const pageName = (first?.snapshot || {}).page_name || first?.page_name;
        if (typeof pageName === "string" && pageName.trim()) extractedName = pageName.trim();
      }
      if (extractedName === "Unknown Brand") {
        try {
          const pageId = new URL(adsLibraryUrl).searchParams.get("view_all_page_id");
          if (pageId) extractedName = `Page ${pageId}`;
        } catch (_) {}
      }
    }
    const finalBrandName = (brandNameInput?.trim() || extractedName).slice(0, 120);

    let brand_id: string;
    const { data: existing } = await supabase.from("brands").select("id").eq("ads_library_url", adsLibraryUrl).maybeSingle();

    if (existing?.id) {
      brand_id = existing.id;
      await supabase
        .from("brands")
        .update({ brand_name: finalBrandName, is_active: true, business_id: businessId, user_id: userId })
        .eq("id", brand_id);
    } else {
      brand_id = generateUUID();
      const { error: insErr } = await supabase
        .from("brands")
        .insert({
          id: brand_id,
          brand_name: finalBrandName,
          ads_library_url: adsLibraryUrl,
          is_active: true,
          business_id: businessId,
          user_id: userId,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
    }

    if (adItems.length === 0) {
      await supabase
        .from("brands")
        .update({ last_fetch_status: "error", last_fetch_error: "No valid ads found in Apify response" })
        .eq("id", brand_id);
      return jsonResponse({
        success: false,
        error: { message: "No valid ads found in Apify response" },
        brand: { id: brand_id, brand_name: finalBrandName },
        ingestion: { requested: `${count} items`, received: items.length, inserted: 0 },
      });
    }

    const rows = adItems.map((ad: any) => transformAdData(ad, brand_id, "apify"));
    const BATCH_SIZE = 200;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).filter((row) => row.ad_archive_id && row.ad_archive_id.trim() !== "");
      if (batch.length === 0) continue;
      const { error: upsertError } = await supabase.from("raw_data").upsert(batch, { onConflict: "ad_archive_id" });
      if (upsertError) throw upsertError;
    }

    const { count: verifyCount, error: verifyError } = await supabase
      .from("raw_data")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brand_id);
    if (verifyError) throw verifyError;
    const actualInserted = verifyCount ?? 0;

    if (actualInserted > 0) {
      await supabase
        .from("brands")
        .update({ last_fetched_date: formatDate(new Date()), last_fetch_status: "success", last_fetch_error: null })
        .eq("id", brand_id);

      let summaryResult = { creative: 0, funnel: 0 };
      if (refreshSummaries) {
        try {
          const summaryRes = await fetch(`${supabaseUrl}/functions/v1/populate_summaries`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: JSON.stringify({ brand_id, business_id: businessId }),
          });
          const summaryData = await summaryRes.json().catch(() => ({}));
          summaryResult = {
            creative: summaryData.creative || 0,
            funnel: summaryData.funnel || 0,
          };
        } catch (_) {}
      }

      return jsonResponse({
        success: true,
        message: "Ingestion completed successfully",
        brand: { id: brand_id, brand_name: finalBrandName },
        ingestion: {
          requested: `${count} items`,
          received: items.length,
          inserted: actualInserted,
          transformed: rows.length,
          batches: Math.ceil(rows.length / BATCH_SIZE),
        },
        summaries: summaryResult,
      });
    }

    await supabase
      .from("brands")
      .update({ last_fetch_status: "error", last_fetch_error: "Upsert completed but no data found in database after insert" })
      .eq("id", brand_id);

    return jsonResponse({
      success: false,
      error: { message: "Upsert completed but no data found in database" },
      brand: { id: brand_id, brand_name: finalBrandName },
      ingestion: { requested: `${count} items`, received: items.length, inserted: 0, transformed: rows.length },
    });
  } catch (err) {
    const msg = errMessage(err);
    return jsonResponse({ success: false, error: { message: msg } }, 500);
  }
});
