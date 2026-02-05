import { getSupabaseServerClient } from "@/lib/supabase"
import { readFileSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"

/**
 * Seed brands from brandslinks.csv
 * Column A = Player (brand_name), Column B = FB active pages (space/comma separated URLs)
 * One brand row per page; same brand_name for all pages of one player.
 * Optional: ?replace_test=true to deactivate brands whose name starts with "Test Brand"
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const replaceTest = searchParams.get("replace_test") === "true"

    const supabase = getSupabaseServerClient()

    // Read CSV from project root
    const csvPath = join(process.cwd(), "brandslinks.csv")
    let csvContent: string
    try {
      csvContent = readFileSync(csvPath, "utf-8")
    } catch (e) {
      return Response.json(
        { success: false, error: `Could not read brandslinks.csv: ${e}` },
        { status: 400 }
      )
    }

    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim())
    if (lines.length < 2) {
      return Response.json(
        { success: false, error: "CSV must have header and at least one data row" },
        { status: 400 }
      )
    }

    const header = lines[0].toLowerCase()
    const playerCol = "player"
    const urlCol = "fb active pages"
    if (!header.includes(playerCol) || !header.includes("fb")) {
      return Response.json(
        { success: false, error: "CSV must have 'Player' and 'FB active pages' columns" },
        { status: 400 }
      )
    }

    type Row = { player: string; urls: string[] }
    const rows: Row[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      // First comma separates Player (col A) from FB active pages (col B)
      const firstComma = line.indexOf(",")
      const player = (firstComma >= 0 ? line.slice(0, firstComma) : line).trim()
      const urlCell = (firstComma >= 0 ? line.slice(firstComma + 1) : "").trim()
      if (!player) continue

      // Split URLs: space, newline, or comma; strip # and trailing slashes
      const urls = urlCell
        .split(/[\s,\n]+/)
        .map((u) => u.replace(/#.*$/, "").replace(/\/+$/, "").trim())
        .filter((u) => u.length > 10 && (u.startsWith("http") || u.includes("facebook.com")))

      if (urls.length > 0) rows.push({ player, urls })
    }

    if (replaceTest) {
      const { data: testBrands } = await supabase
        .from("brands")
        .select("id")
        .like("brand_name", "Test Brand%")
      if (testBrands?.length) {
        await supabase
          .from("brands")
          .update({ is_active: false })
          .like("brand_name", "Test Brand%")
      }
    }

    const today = new Date().toISOString().split("T")[0]
    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const { player, urls } of rows) {
      const brandName = player.slice(0, 120)

      for (const url of urls) {
        const normalizedUrl = url.split("#")[0].trim() || url
        if (!normalizedUrl) continue

        const { data: existing } = await supabase
          .from("brands")
          .select("id")
          .eq("ads_library_url", normalizedUrl)
          .maybeSingle()

        if (existing) {
          const { error: upErr } = await supabase
            .from("brands")
            .update({
              brand_name: brandName,
              is_active: true,
              last_fetch_status: "pending",
              last_fetch_error: null,
            })
            .eq("id", existing.id)
          if (upErr) errors.push(`${brandName} ${normalizedUrl}: ${upErr.message}`)
          else updated++
        } else {
          const { error: insErr } = await supabase.from("brands").insert({
            id: randomUUID(),
            brand_name: brandName,
            ads_library_url: normalizedUrl,
            is_active: true,
            last_fetched_date: null,
            last_fetch_status: "pending",
            last_fetch_error: null,
          })
          if (insErr) errors.push(`${brandName} ${normalizedUrl}: ${insErr.message}`)
          else inserted++
        }
      }
    }

    return Response.json({
      success: true,
      message: "Brands seeded from brandslinks.csv",
      stats: { rowsProcessed: rows.length, inserted, updated, errors: errors.length },
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    })
  } catch (error) {
    console.error("[seed-brands-csv] Error:", error)
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
