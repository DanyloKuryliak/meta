/// <reference path="./url-modules.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

/** Maximum creatives per brand: we fetch the last 300 creatives from Meta Ads Library for one brand. Enforced in edge function and refresh-all-with-limit API. */
const MAX_CREATIVES_PER_BRAND = 300;

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

async function fetchAdsFromAPI(
  adsLibraryUrl: string,
  source: string = "apify",
  options: { start_date?: string; end_date?: string; count?: number }
): Promise<any[]> {
  if (source === "meta") throw new Error("Meta API not yet implemented");

  const apifyToken = Deno.env.get("APIFY_TOKEN");
  if (!apifyToken) throw new Error("APIFY_TOKEN not configured");

  const apifyInput: any = {
    sortBy: "start_date",
    sortOrder: "DESC",
    scrapeAdDetails: false,
    scrapePageAds: { activeStatus: "all", countryCode: "ALL" },
    urls: [{ url: adsLibraryUrl }],
  };

  if (options.count && options.count > 0) {
    apifyInput.maxItems = Math.min(MAX_CREATIVES_PER_BRAND, options.count);
  } else if (options.start_date && options.end_date) {
    apifyInput.start_date_min = options.start_date;
    apifyInput.start_date_max = options.end_date;
    apifyInput.maxItems = 5000;
  } else {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    apifyInput.start_date_min = formatDate(thirtyDaysAgo);
    apifyInput.start_date_max = formatDate(today);
    apifyInput.maxItems = 100;
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

  const cap = options.count && options.count > 0 ? Math.min(MAX_CREATIVES_PER_BRAND, options.count) : undefined;
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
  let endDate: Date | null = null;

  const dateSources = [
    ad.start_date,
    ad.ad_delivery_start_time,
    snapshot.start_date,
  ];
  for (const dateValue of dateSources) {
    if (!dateValue) continue;
    try {
      if (typeof dateValue === "string") {
        startDate = new Date(dateValue);
        if (!isNaN(startDate.getTime())) break;
      } else if (typeof dateValue === "number") {
        const ts = dateValue > 1e12 ? dateValue : dateValue * 1000;
        startDate = new Date(ts);
        if (!isNaN(startDate.getTime())) break;
      }
    } catch (_) {}
  }
  if (!startDate || isNaN(startDate.getTime())) {
    if (ad.creation_date) {
      try {
        const ts = typeof ad.creation_date === "number"
          ? (ad.creation_date > 1e12 ? ad.creation_date : ad.creation_date * 1000)
          : new Date(ad.creation_date).getTime();
        startDate = new Date(ts);
      } catch (_) {}
    }
    if (!startDate || isNaN(startDate.getTime())) startDate = new Date();
  }

  if (ad.end_date) {
    try {
      const endTs = typeof ad.end_date === "number" ? ad.end_date : parseInt(String(ad.end_date));
      if (!isNaN(endTs) && endTs > 0) {
        endDate = new Date(endTs > 1e12 ? endTs : endTs * 1000);
        if (isNaN(endDate.getTime())) endDate = null;
      }
    } catch (_) {}
  }

  let thumbnailUrl: string | null = null;
  let mediaUrl: string | null = null;
  const firstCard = snapshot.cards?.[0];

  if (snapshot.cards && Array.isArray(snapshot.cards) && snapshot.cards.length > 0) {
    mediaUrl = firstCard.video_hd_url || firstCard.video_sd_url || firstCard.original_image_url || firstCard.resized_image_url || null;
    thumbnailUrl = firstCard.video_preview_image_url || firstCard.resized_image_url || firstCard.original_image_url || null;
  }
  if ((!mediaUrl || !thumbnailUrl) && snapshot.videos?.length > 0) {
    const v = snapshot.videos[0];
    thumbnailUrl = thumbnailUrl || v.video_preview_image_url || null;
    mediaUrl = mediaUrl || v.video_hd_url || v.video_sd_url || null;
  }
  if ((!mediaUrl || !thumbnailUrl) && snapshot.images?.length > 0) {
    const img = snapshot.images[0];
    mediaUrl = mediaUrl || img.original_image_url || null;
    thumbnailUrl = thumbnailUrl || img.resized_image_url || img.original_image_url || null;
  }

  const displayFormat = snapshot.display_format || ad.display_format || null;
  let linkUrl = snapshot.link_url || null;
  if (!linkUrl && firstCard) linkUrl = firstCard.link_url || null;

  let ctaText = snapshot.cta_text || null;
  let ctaType = snapshot.cta_type || null;
  if (firstCard) {
    ctaText = ctaText || firstCard.cta_text || null;
    ctaType = ctaType || firstCard.cta_type || null;
  }

  let caption: string | null = null;
  if (snapshot.body?.text) caption = snapshot.body.text;
  else if (snapshot.caption) caption = snapshot.caption;
  else if (ad.caption) caption = ad.caption;

  const pageName = snapshot.page_name || ad.page_name || null;

  let adArchiveId = String(ad.ad_archive_id || ad.id || "");
  if (!adArchiveId || adArchiveId === "undefined" || adArchiveId === "null") {
    const pageId = String(ad.page_id || snapshot.page_id || "");
    adArchiveId = `${pageId}_${startDate ? startDate.getTime() : Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  const hasVideo = !!(firstCard?.video_hd_url || firstCard?.video_sd_url || snapshot.videos?.length > 0);
  let mediaType: string | null = null;
  if (displayFormat === "VIDEO" || hasVideo) mediaType = "video";
  else if (displayFormat === "IMAGE" || displayFormat === "DPA" || displayFormat === "DCO") mediaType = "image";

  return {
    brand_id: brandId,
    ad_archive_id: adArchiveId,
    source,
    ad_library_url: ad.ad_library_url || null,
    url: ad.url || null,
    page_id: String(ad.page_id || snapshot.page_id || ""),
    page_name: pageName,
    start_date: startDate.toISOString(),
    end_date: endDate ? formatDate(endDate) : null,
    creation_date: startDate.toISOString(),
    start_date_formatted: ad.start_date_formatted || null,
    end_date_formatted: ad.end_date_formatted || null,
    publisher_platform: Array.isArray(ad.publisher_platform) ? ad.publisher_platform : null,
    page_categories: Array.isArray(snapshot.page_categories) ? snapshot.page_categories : null,
    caption,
    display_format: displayFormat,
    media_type: mediaType,
    ad_status: ad.is_active === true ? "ACTIVE" : ad.is_active === false ? "INACTIVE" : null,
    link_url: linkUrl,
    total_active_time: ad.total_active_time ?? 0,
    cta_text: ctaText,
    cta_type: ctaType,
    ad_title: snapshot.title || null,
    thumbnail_url: thumbnailUrl,
    media_url: mediaUrl,
    page_like_count: snapshot.page_like_count ?? null,
    collation_count: ad.collation_count ?? 1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: { message: "POST only" } }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) return jsonResponse({ success: false, error: { message: "Server misconfigured" } }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let adsLibraryUrlForError: string | undefined;

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    const adsLibraryUrl = typeof body.ads_library_url === "string" ? body.ads_library_url : undefined;
    adsLibraryUrlForError = adsLibraryUrl;
    const brandNameInput = typeof body.brand_name === "string" ? body.brand_name : undefined;
    const source = typeof body.source === "string" ? body.source : "apify";
    const rawCount = typeof body.count === "number" ? body.count : (typeof body.count === "string" ? parseInt(body.count) : undefined);
    const count = rawCount != null && rawCount > 0 ? Math.min(MAX_CREATIVES_PER_BRAND, rawCount) : undefined;
    const refreshSummaries = body.refresh_summaries !== false;

    if (!adsLibraryUrl) throw new Error("ads_library_url is required");
    try {
      new URL(adsLibraryUrl);
    } catch {
      throw new Error("Invalid ads_library_url");
    }

    let extractedName = "Unknown Brand";
    try {
      const u = new URL(adsLibraryUrl);
      const pageId = u.searchParams.get("view_all_page_id");
      if (pageId) extractedName = `Page ${pageId}`;
    } catch (_) {}

    const finalBrandName = (brandNameInput?.trim() || extractedName).slice(0, 120);

    let brand_id: string;
    const { data: existing } = await supabase.from("brands").select("id").eq("ads_library_url", adsLibraryUrl).maybeSingle();

    if (existing?.id) {
      brand_id = existing.id;
      await supabase.from("brands").update({ brand_name: finalBrandName, is_active: true }).eq("id", brand_id);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("brands")
        .insert({ brand_name: finalBrandName, ads_library_url: adsLibraryUrl, is_active: true })
        .select("id")
        .single();
      if (insErr) throw insErr;
      brand_id = inserted.id;
    }

    const fetchOptions: { start_date?: string; end_date?: string; count?: number } = {};
    if (count && count > 0) {
      fetchOptions.count = count;
    } else if (body.start_date && body.end_date) {
      fetchOptions.start_date = body.start_date;
      fetchOptions.end_date = body.end_date;
    } else {
      const today = new Date();
      const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 30);
      fetchOptions.start_date = formatDate(startDate);
      fetchOptions.end_date = formatDate(endDate);
    }

    const items = await fetchAdsFromAPI(adsLibraryUrl, source, fetchOptions);
    const adItems = items.filter((x: any) => x && (x.ad_archive_id || x.id) && !x.errorCode && !x.error);

    if (adItems.length === 0) {
      await supabase.from("brands").update({
        last_fetch_status: "error",
        last_fetch_error: "No valid ads found in Apify response",
      }).eq("id", brand_id);

      return jsonResponse({
        success: false,
        error: { message: "No valid ads found in Apify response" },
        brand: { id: brand_id, brand_name: finalBrandName },
        ingestion: { requested: count ? `${count} items` : "date range", received: items.length, inserted: 0 },
      });
    }

    const rows = adItems.map((ad: any) => transformAdData(ad, brand_id, source));
    const BATCH_SIZE = 200;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
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
      await supabase.from("brands").update({
        last_fetched_date: formatDate(new Date()),
        last_fetch_status: "success",
        last_fetch_error: null,
      }).eq("id", brand_id);

      let summaryResult = { creative: 0, funnel: 0 };
      if (refreshSummaries) {
        const functionUrl = `${supabaseUrl}/functions/v1`;
        const headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "apikey": supabaseServiceKey,
        };
        try {
          const [creativeRes, funnelRes] = await Promise.all([
            fetch(`${functionUrl}/populate_creative_summary`, { method: "POST", headers, body: JSON.stringify({ brand_id }) }),
            fetch(`${functionUrl}/populate_funnel_summary`, { method: "POST", headers, body: JSON.stringify({ brand_id }) }),
          ]);
          const creativeData = await creativeRes.json().catch(() => ({ inserted: 0 }));
          const funnelData = await funnelRes.json().catch(() => ({ inserted: 0 }));
          summaryResult = { creative: creativeData.inserted || 0, funnel: funnelData.inserted || 0 };
        } catch (_) {}
      }

      return jsonResponse({
        success: true,
        message: "Ingestion completed successfully",
        brand: { id: brand_id, brand_name: finalBrandName, ads_library_url: adsLibraryUrl },
        ingestion: {
          requested: count ? `${count} items` : "date range",
          received: items.length,
          inserted: actualInserted,
          transformed: rows.length,
          batches: Math.ceil(rows.length / BATCH_SIZE),
        },
        summaries: summaryResult,
      });
    }

    await supabase.from("brands").update({
      last_fetch_status: "error",
      last_fetch_error: "Upsert completed but no data found in database after insert",
    }).eq("id", brand_id);

    return jsonResponse({
      success: false,
      error: { message: "Upsert completed but no data found in database" },
      brand: { id: brand_id, brand_name: finalBrandName },
      ingestion: { requested: count ? `${count} items` : "date range", received: items.length, inserted: 0, transformed: rows.length },
    });
  } catch (err) {
    const msg = errMessage(err);
    if (adsLibraryUrlForError) {
      try {
        const { data: brand } = await supabase.from("brands").select("id").eq("ads_library_url", adsLibraryUrlForError).maybeSingle();
        if (brand?.id) {
          await supabase.from("brands").update({ last_fetch_status: "error", last_fetch_error: msg }).eq("id", brand.id);
        }
      } catch (_) {}
    }
    return jsonResponse({ success: false, error: { message: msg } }, 500);
  }
});
