// Read-only eBay active-listing sync for Reseller Command Center.
//
// Design:
// - Reads the authenticated seller's existing eBay listings.
// - Upserts marketplace snapshots into public.marketplace_listings.
// - Does NOT revise, end, migrate, or create listings on eBay.
// - Existing eBay UI listings remain managed by eBay until we explicitly choose otherwise.
//
// Activation prerequisites:
// 1. eBay Developer approval.
// 2. OAuth callback/token storage implemented server-side.
// 3. EBAY Trading API access token available to this Edge Function.
//
// We intentionally use GetMyeBaySelling for the first import because Nancy's
// current catalog is ~100 listings and those listings were created in eBay's UI.
// Inventory API does not surface UI/Trading-model listings unless they are migrated.

import { withSupabase } from "npm:@supabase/server";

const EBAY_TRADING_ENDPOINT = "https://api.ebay.com/ws/api.dll";
const EBAY_COMPATIBILITY_LEVEL = "1477";
const PAGE_SIZE = 200;

type ListingSnapshot = {
  external_listing_id: string;
  external_sku: string | null;
  listing_url: string | null;
  title: string | null;
  status: string;
  quantity: number | null;
  price: number | null;
  currency: string | null;
  image_urls: string[];
  listed_at: string | null;
  raw_data: Record<string, unknown>;
};

function xmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;"
  }[char]!));
}

function text(node: Element, selector: string): string | null {
  return node.querySelector(selector)?.textContent?.trim() || null;
}

function numberOrNull(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function listingFromItem(item: Element): ListingSnapshot | null {
  const itemId = text(item, "ItemID");
  if (!itemId) return null;

  const pictureUrls = Array.from(item.querySelectorAll("PictureDetails > PictureURL"))
    .map((node) => node.textContent?.trim())
    .filter((value): value is string => Boolean(value));

  const priceNode = item.querySelector("SellingStatus > CurrentPrice") ??
    item.querySelector("StartPrice");

  return {
    external_listing_id: itemId,
    external_sku: text(item, "SKU"),
    listing_url: text(item, "ListingDetails > ViewItemURL") ??
      `https://www.ebay.com/itm/${encodeURIComponent(itemId)}`,
    title: text(item, "Title"),
    status: "active",
    quantity: numberOrNull(text(item, "QuantityAvailable") ?? text(item, "Quantity")),
    price: numberOrNull(priceNode?.textContent?.trim() || null),
    currency: priceNode?.getAttribute("currencyID") || "USD",
    image_urls: pictureUrls,
    listed_at: text(item, "ListingDetails > StartTime"),
    raw_data: {
      listingType: text(item, "ListingType"),
      timeLeft: text(item, "TimeLeft"),
      conditionId: text(item, "ConditionID"),
    },
  };
}

async function fetchPage(accessToken: string, pageNumber: number) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${xmlEscape(accessToken)}</eBayAuthToken>
  </RequesterCredentials>
  <DetailLevel>ReturnAll</DetailLevel>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${PAGE_SIZE}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;

  const response = await fetch(EBAY_TRADING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-COMPATIBILITY-LEVEL": EBAY_COMPATIBILITY_LEVEL,
      "X-EBAY-API-SITEID": "0",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`eBay returned HTTP ${response.status}`);
  }

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (!doc) throw new Error("Could not parse eBay response.");

  const ack = text(doc.documentElement, "Ack");
  if (ack !== "Success" && ack !== "Warning") {
    const message = text(doc.documentElement, "Errors > LongMessage") ??
      text(doc.documentElement, "Errors > ShortMessage") ??
      "eBay API request failed.";
    throw new Error(message);
  }

  const listings = Array.from(doc.querySelectorAll("ActiveList > ItemArray > Item"))
    .map(listingFromItem)
    .filter((listing): listing is ListingSnapshot => listing !== null);

  const totalPages = numberOrNull(text(doc.documentElement,
    "ActiveList > PaginationResult > TotalNumberOfPages")) ?? 1;

  return { listings, totalPages };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    // Placeholder secret name until the OAuth callback/token vault is activated.
    // Never place the token in frontend JavaScript or repository files.
    const accessToken = Deno.env.get("EBAY_USER_ACCESS_TOKEN");
    if (!accessToken) {
      return Response.json({
        ready: false,
        imported: 0,
        message: "eBay seller authorization has not been completed yet.",
      }, { status: 503 });
    }

    const allListings: ListingSnapshot[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await fetchPage(accessToken, page);
      allListings.push(...result.listings);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages);

    const now = new Date().toISOString();
    const rows = allListings.map((listing) => ({
      owner_id: ctx.userClaims!.sub,
      inventory_item_id: null,
      marketplace: "eBay",
      ...listing,
      last_synced_at: now,
    }));

    if (rows.length) {
      const { error } = await ctx.supabase
        .from("marketplace_listings")
        .upsert(rows, {
          onConflict: "owner_id,marketplace,external_listing_id",
        });
      if (error) throw error;
    }

    return Response.json({
      ready: true,
      imported: rows.length,
      pages: totalPages,
      mode: "read-only",
    });
  }),
};
