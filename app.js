// Supabase authentication protects the cloud-backed version of the app.
// Supabase is the inventory source of truth. localStorage remains untouched as a safety backup during rollout.
async function initializeAuthentication() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  if (session) {
    try {
      await loadCloudInventory();
      setAuthenticatedState(true);
    } catch (error) {
      console.error("Cloud inventory load failed:", error);
      items = [];
      renderAll();
      setAuthenticatedState(false);
      setLoginMessage("Signed in, but cloud inventory could not be loaded. Refresh and try again.", true);
    }
  } else {
    setAuthenticatedState(false);
  }

  supabaseClient.auth.onAuthStateChange((event, nextSession) => {
    if (!nextSession) {
      items = [];
      renderAll();
      setAuthenticatedState(false);
      return;
    }

    if (event === "SIGNED_IN") {
      loadCloudInventory()
        .then(() => {
          setAuthenticatedState(true);
          setLoginMessage("");
        })
        .catch(error => {
          console.error("Cloud inventory load failed after sign-in:", error);
          items = [];
          renderAll();
          setAuthenticatedState(false);
          setLoginMessage("Signed in, but cloud inventory could not be loaded. Refresh and try again.", true);
        });
    }
  });
}

async function loadCloudInventory() {
  const { data, error } = await supabaseClient
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    await verifySupabaseAccess();
    throw error;
  }
  items = (data || []).map(databaseToItem);
  await loadMarketplaceListings();
  renderAll();
  await verifySupabaseAccess();
}

async function loadMarketplaceListings() {
  const { data, error } = await supabaseClient
    .from("marketplace_listings")
    .select("*")
    .order("last_synced_at", { ascending: false, nullsFirst: false });
  if (error) {
    console.warn("Marketplace listings could not be loaded:", error);
    marketplaceListings = [];
    return;
  }
  marketplaceListings = data || [];
}

async function saveCloudItem(item) {
  const { data, error } = await supabaseClient
    .from("inventory_items")
    .upsert(itemToDatabase(item), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return databaseToItem(data);
}

async function deleteCloudItem(id) {
  const { error } = await supabaseClient.from("inventory_items").delete().eq("id", id);
  if (error) throw error;
}

function setAuthenticatedState(isAuthenticated) {
  const gate = document.getElementById("authGate");
  const shell = document.getElementById("appShell");
  if (gate) gate.hidden = isAuthenticated;
  if (shell) shell.hidden = !isAuthenticated;
}

function setLoginMessage(message, isError = false) {
  const element = document.getElementById("loginMessage");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
}
async function verifySupabaseAccess() {
  const pill = document.getElementById("cloudStatusPill");
  const statusText = document.getElementById("cloudStatusText");
  const account = document.getElementById("cloudAccount");
  try {
    await testSupabaseInventoryConnection();
    const result = await supabaseClient.auth.getUser();
    const user = result.data.user;
    if (pill) { pill.textContent = "Connected"; pill.classList.add("ready"); }
    if (statusText) statusText.textContent = "Supabase is connected and your private inventory table is accessible.";
    if (account) account.textContent = user && user.email ? "Signed in as " + user.email : "";
    console.info("Supabase inventory connection verified.");
  } catch (error) {
    if (pill) { pill.textContent = "Needs attention"; pill.classList.remove("ready"); }
    if (statusText) statusText.textContent = "Signed in, but the inventory database could not be accessed.";
    if (account) account.textContent = "";
    console.error("Supabase inventory connection failed:", error);
    toast("Signed in, but database access needs attention");
  }
}



// Translate between the existing browser model (camelCase) and the
// Supabase inventory_items table (snake_case). Keeping this isolated makes
// migration reversible and prevents the rest of the dashboard from changing.
function itemToDatabase(item) {
  return {
    id: item.id,
    title: item.title,
    brand: item.brand || null,
    category: item.category || null,
    purchase_cost: Number(item.purchaseCost || 0),
    purchase_date: item.purchaseDate || null,
    source: item.source || null,
    storage_location: item.storage || null,
    status: item.status || "Unlisted",
    list_price: Number(item.listPrice || 0),
    listed_marketplaces: item.listedMarketplaces || [],
    sale_marketplace: item.saleMarketplace || null,
    sale_date: item.saleDate || null,
    sale_price: Number(item.salePrice || 0),
    shipping_collected: Number(item.shippingCollected || 0),
    fees: Number(item.fees || 0),
    shipping_cost: Number(item.shippingCost || 0),
    other_expenses: Number(item.otherExpenses || 0),
    notes: item.notes || null
  };
}

function databaseToItem(row) {
  return {
    id: row.id, title: row.title, brand: row.brand || "", category: row.category || "",
    purchaseCost: Number(row.purchase_cost || 0), purchaseDate: row.purchase_date || "",
    source: row.source || "", storage: row.storage_location || "", status: row.status || "Unlisted",
    listPrice: Number(row.list_price || 0), listedMarketplaces: row.listed_marketplaces || [],
    saleMarketplace: row.sale_marketplace || "", saleDate: row.sale_date || "",
    salePrice: Number(row.sale_price || 0), shippingCollected: Number(row.shipping_collected || 0),
    fees: Number(row.fees || 0), shippingCost: Number(row.shipping_cost || 0),
    otherExpenses: Number(row.other_expenses || 0), notes: row.notes || ""
  };
}

async function testSupabaseInventoryConnection() {
  const { data, error } = await supabaseClient.from("inventory_items").select("id").limit(1);
  if (error) throw error;
  return data;
}

const SETTINGS_KEY = "resellerCommandCenter.settings.v1";
const OPPORTUNITIES_KEY = "resellerCommandCenter.opportunities.v1";
const SCOUT_DEFAULTS = {
  zipCode: "34221",
  radiusMiles: 50,
  minimumRoi: 100,
  feePercent: 13.6,
  orderFee: 0.40,
  suppliesCost: 1.50
};

const marketplaces = [
  "eBay",
  "Poshmark",
  "Depop",
  "Etsy",
  "Facebook Marketplace",
  "Mercari",
  "Other"
];

// Inventory is loaded from Supabase after authentication.
// Legacy browser inventory is deliberately left untouched as a rollback backup.
let items = [];
let marketplaceListings = [];
let settings = loadSettings();
let opportunities = loadOpportunities();

const $ = (id) => document.getElementById(id);
const currency = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
}).format(Number(value || 0));

function loadSettings() {
  const defaults = { defaultMarketplace: "eBay", staleDays: 90 };
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return defaults;
  try { return { ...defaults, ...JSON.parse(stored) }; } catch { return defaults; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadOpportunities() {
  const stored = localStorage.getItem(OPPORTUNITIES_KEY);
  if (!stored) return [];
  try { return JSON.parse(stored); } catch { return []; }
}

function saveOpportunities() {
  localStorage.setItem(OPPORTUNITIES_KEY, JSON.stringify(opportunities));
  renderScout();
}

function profit(item) {
  return Number(item.salePrice || 0)
    + Number(item.shippingCollected || 0)
    - Number(item.purchaseCost || 0)
    - Number(item.fees || 0)
    - Number(item.shippingCost || 0)
    - Number(item.otherExpenses || 0);
}

function roi(item) {
  const cost = Number(item.purchaseCost || 0);
  return cost > 0 ? (profit(item) / cost) * 100 : 0;
}

function daysBetween(start, end = new Date().toISOString().slice(0, 10)) {
  if (!start) return 0;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function statusBadge(status) {
  const cls = status.toLowerCase();
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDashboard() {
  const sold = items.filter(i => i.status === "Sold");
  const active = items.filter(i => i.status !== "Sold");
  const gross = sold.reduce((sum, i) => sum + Number(i.salePrice || 0) + Number(i.shippingCollected || 0), 0);
  const net = sold.reduce((sum, i) => sum + profit(i), 0);
  const activeCost = active.reduce((sum, i) => sum + Number(i.purchaseCost || 0), 0);
  const avgRoi = sold.length ? sold.reduce((sum, i) => sum + roi(i), 0) / sold.length : 0;
  const avgDays = sold.length ? sold.reduce((sum, i) => sum + daysBetween(i.purchaseDate, i.saleDate), 0) / sold.length : 0;

  $("netProfit").textContent = currency(net);
  $("grossSales").textContent = currency(gross);
  $("activeInventory").textContent = active.length;
  $("inventoryCost").textContent = currency(activeCost);
  $("averageRoi").textContent = `${Math.round(avgRoi)}%`;
  $("avgDays").textContent = Math.round(avgDays);

  renderMarketplaceBars(sold);
  renderAttention(active);
  renderRecentItems();
}

function renderMarketplaceBars(sold) {
  const totals = {};
  sold.forEach(item => {
    const key = item.saleMarketplace || "Other";
    totals[key] = (totals[key] || 0) + profit(item);
  });

  const entries = Object.entries(totals).sort((a,b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([,value]) => Math.max(value, 0)), 1);

  $("marketplaceBars").innerHTML = entries.length
    ? entries.map(([name, value]) => `
      <div class="bar-row">
        <div class="bar-meta">
          <strong>${escapeHtml(name)}</strong>
          <span>${currency(value)}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (Math.max(value,0)/max)*100)}%"></div></div>
      </div>
    `).join("")
    : `<p class="empty">Record your first sale to see marketplace performance.</p>`;
}

function renderAttention(active) {
  const stale = active
    .filter(i => i.status === "Listed" && daysBetween(i.purchaseDate) >= settings.staleDays)
    .sort((a,b) => daysBetween(b.purchaseDate) - daysBetween(a.purchaseDate));

  const unlisted = active.filter(i => i.status === "Unlisted");
  const missingStorage = active.filter(i => !i.storage);

  const blocks = [];
  if (unlisted.length) {
    blocks.push(`<div class="attention-item"><strong>${unlisted.length} unlisted item${unlisted.length === 1 ? "" : "s"}</strong><span>These are not earning until they are listed.</span></div>`);
  }
  if (stale.length) {
    blocks.push(`<div class="attention-item"><strong>${stale.length} stale listing${stale.length === 1 ? "" : "s"}</strong><span>Listed for at least ${settings.staleDays} days. Review prices or photos.</span></div>`);
  }
  if (missingStorage.length) {
    blocks.push(`<div class="attention-item"><strong>${missingStorage.length} item${missingStorage.length === 1 ? "" : "s"} missing a location</strong><span>Add a shelf, bin or room before inventory grows.</span></div>`);
  }

  $("attentionList").innerHTML = blocks.length
    ? blocks.join("")
    : `<p class="empty">Nothing urgent. Your inventory records look good.</p>`;
}

function renderRecentItems() {
  const recent = [...items].sort((a,b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || "")).slice(0,6);
  $("recentItems").innerHTML = recent.length ? recent.map(item => `
    <tr>
      <td><div class="item-title">${escapeHtml(item.title)}</div><div class="item-meta">${escapeHtml(item.brand || item.category || "")}</div></td>
      <td>${statusBadge(item.status)}</td>
      <td>${currency(item.purchaseCost)}</td>
      <td>${(item.listedMarketplaces || []).map(m => `<span class="badge">${escapeHtml(m)}</span>`).join("") || "—"}</td>
      <td>${item.status === "Sold" ? currency(item.salePrice) : "—"}</td>
      <td>${item.status === "Sold" ? currency(profit(item)) : "—"}</td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="empty">No items yet.</td></tr>`;
}

function renderInventory() {
  const search = $("inventorySearch").value.toLowerCase().trim();
  const status = $("statusFilter").value;
  const market = $("marketplaceFilter").value;

  const filtered = items.filter(item => {
    const haystack = [item.title, item.brand, item.category, item.source, item.storage].join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && (!status || item.status === status)
      && (!market || (item.listedMarketplaces || []).includes(market) || item.saleMarketplace === market);
  });

  $("inventoryTable").innerHTML = filtered.length ? filtered.map(item => `
    <tr>
      <td><div class="item-title">${escapeHtml(item.title)}</div><div class="item-meta">${escapeHtml(item.brand || "")}</div></td>
      <td>${escapeHtml(item.category || "—")}</td>
      <td>${escapeHtml(item.source || "—")}</td>
      <td>${escapeHtml(item.storage || "—")}</td>
      <td>${currency(item.purchaseCost)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${(item.listedMarketplaces || []).map(m => `<span class="badge">${escapeHtml(m)}</span>`).join("") || "—"}</td>
      <td>${daysBetween(item.purchaseDate, item.saleDate || undefined)}</td>
      <td><button class="text-button edit-item" data-id="${item.id}">Edit</button></td>
    </tr>
  `).join("") : `<tr><td colspan="9" class="empty">No matching inventory.</td></tr>`;

  document.querySelectorAll(".edit-item").forEach(btn => {
    btn.addEventListener("click", () => openItemDialog(btn.dataset.id));
  });
}

function renderSales() {
  const sold = items.filter(i => i.status === "Sold").sort((a,b) => (b.saleDate || "").localeCompare(a.saleDate || ""));
  $("salesTable").innerHTML = sold.length ? sold.map(item => `
    <tr>
      <td><div class="item-title">${escapeHtml(item.title)}</div></td>
      <td>${escapeHtml(item.saleMarketplace || "Other")}</td>
      <td>${escapeHtml(item.saleDate || "—")}</td>
      <td>${currency(item.salePrice)}</td>
      <td>${currency(item.shippingCollected)}</td>
      <td>${currency(item.fees)}</td>
      <td>${currency(item.shippingCost)}</td>
      <td>${currency(item.purchaseCost)}</td>
      <td><strong>${currency(profit(item))}</strong></td>
      <td>${Math.round(roi(item))}%</td>
    </tr>
  `).join("") : `<tr><td colspan="10" class="empty">No completed sales yet.</td></tr>`;
}

function renderMarketplaceCards() {
  const descriptions = {
    "eBay": ["API-ready", "Full order, fee and payout automation can be added through secure OAuth."],
    "Etsy": ["API-ready", "Listings, inventory and receipts can be connected through Etsy's API."],
    "Poshmark": ["Email/import", "Use sale emails, CSV exports or one-click manual updates."],
    "Depop": ["Email/import", "Use sale emails, exports or supported partner integrations."],
    "Facebook Marketplace": ["Quick update", "Best handled with a fast sold button for local transactions."],
    "Mercari": ["Email/import", "Use sale notifications, exports or manual confirmation."],
    "Other": ["Manual/import", "Record sales from antique malls, booths, flea markets or private buyers."]
  };

  $("marketplaceCards").innerHTML = marketplaces.map(name => {
    const [mode, description] = descriptions[name];
    const activeCount = items.filter(i => i.status !== "Sold" && (i.listedMarketplaces || []).includes(name)).length;
    const soldCount = items.filter(i => i.status === "Sold" && i.saleMarketplace === name).length;
    const modeClass = mode === "API-ready" ? "ready" : "";
    return `
      <article class="marketplace-card">
        <div class="panel-heading">
          <h3>${escapeHtml(name)}</h3>
          <span class="connection-pill ${modeClass}">${mode}</span>
        </div>
        <p>${description}</p>
        <div class="status-line">
          <span>${activeCount} active</span>
          <span>${soldCount} sold</span>
        </div>
        <button class="secondary marketplace-filter-btn" data-market="${escapeHtml(name)}">View items</button>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".marketplace-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      showView("inventory");
      $("marketplaceFilter").value = btn.dataset.market;
      renderInventory();
    });
  });
}

function normalizeMatchTitle(value = "") {
  return String(value).toLowerCase()
    .replace(/\b(vintage|rare|new|used|lot|set|the|a|an|with|and)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(value = "") {
  return new Set(normalizeMatchTitle(value).split(/\s+/).filter(token => token.length > 1));
}

function suggestInventoryMatch(listing) {
  if (listing.inventory_item_id) {
    const confirmed = items.find(item => item.id === listing.inventory_item_id);
    return confirmed ? { item: confirmed, score: 100, reason: "Confirmed link" } : null;
  }

  const listingTokens = titleTokens(listing.title);
  if (!listingTokens.size) return null;

  let best = null;
  for (const item of items) {
    const itemTokens = titleTokens(item.title);
    if (!itemTokens.size) continue;
    const intersection = [...listingTokens].filter(token => itemTokens.has(token)).length;
    const union = new Set([...listingTokens, ...itemTokens]).size;
    const score = union ? Math.round((intersection / union) * 100) : 0;
    if (!best || score > best.score) best = { item, score, reason: "Title similarity" };
  }

  // Suggestions below 45% are too weak to put in front of the user as a match.
  return best && best.score >= 45 ? best : null;
}

async function confirmEbayListingMatch(listingId, inventoryItemId) {
  const { error } = await supabaseClient
    .from("marketplace_listings")
    .update({
      inventory_item_id: inventoryItemId,
      suggested_inventory_item_id: inventoryItemId,
      match_status: "confirmed",
      match_score: 100,
      match_reason: "Confirmed by user",
      match_reviewed_at: new Date().toISOString()
    })
    .eq("id", listingId)
    .eq("marketplace", "eBay");
  if (error) throw error;
  await loadMarketplaceListings();
  renderEbayListingReview();
}

async function markEbayListingNoMatch(listingId) {
  const { error } = await supabaseClient
    .from("marketplace_listings")
    .update({
      inventory_item_id: null,
      suggested_inventory_item_id: null,
      match_status: "no_match",
      match_score: null,
      match_reason: "Reviewed: no existing inventory match",
      match_reviewed_at: new Date().toISOString()
    })
    .eq("id", listingId)
    .eq("marketplace", "eBay");
  if (error) throw error;
  await loadMarketplaceListings();
  renderEbayListingReview();
}

function renderEbayListingReview() {
  const ebay = marketplaceListings.filter(listing => listing.marketplace === "eBay");
  const linked = ebay.filter(listing => listing.inventory_item_id);
  const unlinked = ebay.filter(listing => !listing.inventory_item_id);
  const latest = ebay.map(listing => listing.last_synced_at).filter(Boolean).sort().reverse()[0];

  const count = $("ebayImportedCount");
  const matched = $("ebayMatchedCount");
  const unmatched = $("ebayUnmatchedCount");
  const lastSync = $("ebayLastSync");
  const table = $("ebayListingReviewTable");
  if (!count || !matched || !unmatched || !lastSync || !table) return;

  count.textContent = `${ebay.length} imported`;
  matched.textContent = linked.length;
  unmatched.textContent = unlinked.length;
  lastSync.textContent = latest ? new Date(latest).toLocaleString() : "Not synced";

  table.innerHTML = ebay.length ? ebay.map(listing => {
    const confirmed = listing.inventory_item_id
      ? items.find(item => item.id === listing.inventory_item_id)
      : null;
    const suggestion = confirmed ? { item: confirmed, score: 100 } : suggestInventoryMatch(listing);
    const suggestionHtml = suggestion
      ? `<strong>${escapeHtml(suggestion.item.title)}</strong><br><span class="item-meta">${suggestion.score}% title match</span>`
      : '<span class="review-needed">No confident match</span>';
    const reviewHtml = confirmed
      ? '<span class="match-confirmed">Confirmed</span>'
      : `<div class="match-actions">
          ${suggestion ? `<button class="secondary confirm-ebay-match" data-listing="${listing.id}" data-inventory="${suggestion.item.id}" type="button">Confirm</button>` : ""}
          <button class="text-button no-ebay-match" data-listing="${listing.id}" type="button">No match</button>
        </div>`;

    return `
      <tr>
        <td><strong>${escapeHtml(listing.title || "Untitled eBay listing")}</strong><br><span class="item-meta">ID ${escapeHtml(listing.external_listing_id || "")}</span></td>
        <td>${currency(listing.price)}</td>
        <td>${escapeHtml(listing.status || "")}</td>
        <td>${suggestionHtml}</td>
        <td>${reviewHtml}</td>
        <td>${listing.last_synced_at ? new Date(listing.last_synced_at).toLocaleString() : "—"}</td>
      </tr>
    `;
  }).join("") : '<tr><td colspan="6" class="empty">No eBay listings imported yet. Nothing will appear here until your seller account is authorized.</td></tr>';

  document.querySelectorAll(".confirm-ebay-match").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await confirmEbayListingMatch(button.dataset.listing, button.dataset.inventory);
        toast("eBay listing linked to inventory.");
      } catch (error) {
        console.error(error);
        toast("Could not save the match.");
      }
    });
  });

  document.querySelectorAll(".no-ebay-match").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await markEbayListingNoMatch(button.dataset.listing);
        toast("Marked as a new/unmatched inventory item.");
      } catch (error) {
        console.error(error);
        toast("Could not save the review.");
      }
    });
  });
}

function opportunityNumbers(opportunity) {
  const askingPrice = Number(opportunity.askingPrice || 0);
  const salePrice = Number(opportunity.estimatedSalePrice || 0);
  const shippingCharged = Number(opportunity.shippingCharged || 0);
  const shippingCost = Number(opportunity.shippingCost || 0);
  const suppliesCost = Number(opportunity.suppliesCost ?? SCOUT_DEFAULTS.suppliesCost);
  const repairCost = Number(opportunity.repairCost || 0);
  const travelCost = Number(opportunity.travelCost || 0);
  const feePercent = Number(opportunity.feePercent ?? SCOUT_DEFAULTS.feePercent);
  const fees = salePrice > 0
    ? ((salePrice + shippingCharged) * feePercent / 100) + SCOUT_DEFAULTS.orderFee
    : 0;
  const netProfit = salePrice + shippingCharged - askingPrice - fees - shippingCost - suppliesCost - repairCost - travelCost;
  const roiPercent = askingPrice > 0 ? (netProfit / askingPrice) * 100 : 0;
  return { askingPrice, salePrice, fees, netProfit, roiPercent };
}

function opportunityRecommendation(opportunity) {
  if (opportunity.status === "Pass") return "Pass";
  const numbers = opportunityNumbers(opportunity);
  if (!numbers.salePrice || !opportunity.confidence) return "Needs Research";
  return numbers.roiPercent >= SCOUT_DEFAULTS.minimumRoi ? "Meets Target" : "Below Target";
}

function categoryFromText(text = "") {
  const value = text.toLowerCase();
  if (/lamp|vase|glass|crystal|pyrex|fiesta|plate|bowl|mug|dish|mirror|frame|decor|candle|pottery|ceramic|china/.test(value)) return "Glassware & Home Décor";
  if (/radio|stereo|speaker|camera|console|xbox|playstation|nintendo|toaster|mixer|blender|coffee maker|vacuum|electronics|appliance/.test(value)) return "Electronics & Small Appliances";
  if (/vintage|antique|collectible|mid.century|signed|figurine|record|rare|retro/.test(value)) return "Vintage & Collectibles";
  if (/chair|table|desk|dresser|cabinet|sofa|couch|bookcase|nightstand|furniture/.test(value)) return "Furniture";
  return "Other Shippable";
}

function soldSearchUrl(title) {
  const query = String(title || "").replace(/\b(new listing|just listed|marketplace)\b/gi, "").trim();
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Complete=1&LH_Sold=1`;
}

function importScoutListings(listings = []) {
  if (!Array.isArray(listings)) return 0;
  let added = 0;
  listings.forEach(listing => {
    const url = String(listing.url || "").split("?")[0];
    if (!url || opportunities.some(item => item.url === url)) return;
    const title = String(listing.title || "Facebook Marketplace listing").trim();
    const researched = Object.hasOwn(listing, "estimatedSalePrice") || Object.hasOwn(listing, "confidence");
    opportunities.unshift({
      id: researched && listing.id ? listing.id : crypto.randomUUID(),
      title,
      url,
      imageUrl: listing.imageUrl || "",
      location: listing.location || "",
      askingPrice: Number(listing.askingPrice || 0),
      category: researched && listing.category ? listing.category : categoryFromText(title),
      scannedAt: listing.scannedAt || new Date().toISOString(),
      estimatedSalePrice: researched ? Number(listing.estimatedSalePrice || 0) : 0,
      shippingCharged: researched ? Number(listing.shippingCharged || 0) : 0,
      shippingCost: researched ? Number(listing.shippingCost || 0) : 0,
      suppliesCost: researched ? Number(listing.suppliesCost ?? SCOUT_DEFAULTS.suppliesCost) : SCOUT_DEFAULTS.suppliesCost,
      repairCost: researched ? Number(listing.repairCost || 0) : 0,
      travelCost: researched ? Number(listing.travelCost || 0) : 0,
      feePercent: researched ? Number(listing.feePercent ?? SCOUT_DEFAULTS.feePercent) : SCOUT_DEFAULTS.feePercent,
      confidence: researched ? listing.confidence || "" : "",
      status: researched ? listing.status || "Watching" : "Watching",
      notes: researched ? listing.notes || "" : ""
    });
    added++;
  });
  if (added) saveOpportunities();
  return added;
}

function renderScout() {
  const search = $("scoutSearch")?.value.toLowerCase().trim() || "";
  const recommendationFilter = $("scoutRecommendationFilter")?.value || "";
  const categoryFilter = $("scoutCategoryFilter")?.value || "";
  const filtered = opportunities.filter(opportunity => {
    const recommendation = opportunityRecommendation(opportunity);
    const haystack = [opportunity.title, opportunity.location, opportunity.category, opportunity.notes].join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && (!recommendationFilter || recommendation === recommendationFilter)
      && (!categoryFilter || opportunity.category === categoryFilter);
  });

  $("scoutUnreviewed").textContent = opportunities.filter(item => opportunityRecommendation(item) === "Needs Research").length;
  $("scoutStrong").textContent = opportunities.filter(item => opportunityRecommendation(item) === "Meets Target").length;

  $("scoutTable").innerHTML = filtered.length ? filtered.map(opportunity => {
    const numbers = opportunityNumbers(opportunity);
    const recommendation = opportunityRecommendation(opportunity);
    const badgeClass = recommendation.toLowerCase().replaceAll(" ", "-");
    return `
      <tr>
        <td>
          <div class="scout-listing-cell">
            ${opportunity.imageUrl ? `<img src="${escapeHtml(opportunity.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
            <div>
              <a class="item-title" href="${escapeHtml(opportunity.url)}" target="_blank" rel="noopener">${escapeHtml(opportunity.title)}</a>
              <div class="item-meta">${escapeHtml(opportunity.location || opportunity.category)}</div>
            </div>
          </div>
        </td>
        <td>${currency(numbers.askingPrice)}</td>
        <td>${numbers.salePrice ? currency(numbers.salePrice) : "—"}</td>
        <td>${numbers.salePrice ? currency(numbers.netProfit) : "—"}</td>
        <td>${numbers.salePrice ? `${Math.round(numbers.roiPercent)}%` : "—"}</td>
        <td><span class="badge scout-${badgeClass}">${recommendation}</span></td>
        <td><button class="text-button research-opportunity" data-id="${opportunity.id}">Research</button></td>
      </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">No sourcing opportunities yet. Scan Facebook Marketplace with the companion extension or import a scout file.</td></tr>`;

  document.querySelectorAll(".research-opportunity").forEach(button => {
    button.addEventListener("click", () => openOpportunityDialog(button.dataset.id));
  });
}

function openOpportunityDialog(id) {
  const opportunity = opportunities.find(item => item.id === id);
  if (!opportunity) return;
  const numbers = opportunityNumbers(opportunity);
  $("opportunityId").value = opportunity.id;
  $("opportunityTitle").value = opportunity.title;
  $("opportunityAskingPrice").value = opportunity.askingPrice;
  $("opportunityCategory").value = opportunity.category || categoryFromText(opportunity.title);
  $("opportunitySalePrice").value = opportunity.estimatedSalePrice || "";
  $("opportunityShippingCharged").value = opportunity.shippingCharged || 0;
  $("opportunityShippingCost").value = opportunity.shippingCost || 0;
  $("opportunitySuppliesCost").value = opportunity.suppliesCost ?? SCOUT_DEFAULTS.suppliesCost;
  $("opportunityRepairCost").value = opportunity.repairCost || 0;
  $("opportunityTravelCost").value = opportunity.travelCost || 0;
  $("opportunityFeePercent").value = opportunity.feePercent ?? SCOUT_DEFAULTS.feePercent;
  $("opportunityConfidence").value = opportunity.confidence || "";
  $("opportunityStatus").value = opportunity.status || "Watching";
  $("opportunityNotes").value = opportunity.notes || "";
  $("opportunitySource").innerHTML = `
    ${opportunity.imageUrl ? `<img src="${escapeHtml(opportunity.imageUrl)}" alt="" referrerpolicy="no-referrer" />` : ""}
    <div><strong>${escapeHtml(opportunity.location || "Facebook Marketplace")}</strong><br><a href="${escapeHtml(opportunity.url)}" target="_blank" rel="noopener">Open original listing</a></div>`;
  $("ebayResearchBtn").href = soldSearchUrl(opportunity.title);
  updateOpportunityCalculation(numbers);
  $("opportunityDialog").showModal();
}

function readOpportunityForm() {
  const existing = opportunities.find(item => item.id === $("opportunityId").value) || {};
  return {
    ...existing,
    title: $("opportunityTitle").value.trim(),
    askingPrice: Number($("opportunityAskingPrice").value || 0),
    category: $("opportunityCategory").value,
    estimatedSalePrice: Number($("opportunitySalePrice").value || 0),
    shippingCharged: Number($("opportunityShippingCharged").value || 0),
    shippingCost: Number($("opportunityShippingCost").value || 0),
    suppliesCost: Number($("opportunitySuppliesCost").value || 0),
    repairCost: Number($("opportunityRepairCost").value || 0),
    travelCost: Number($("opportunityTravelCost").value || 0),
    feePercent: Number($("opportunityFeePercent").value || 0),
    confidence: $("opportunityConfidence").value,
    status: $("opportunityStatus").value,
    notes: $("opportunityNotes").value.trim()
  };
}

function updateOpportunityCalculation(opportunity = readOpportunityForm()) {
  const numbers = opportunityNumbers(opportunity);
  const recommendation = opportunityRecommendation(opportunity);
  $("opportunityCalculation").innerHTML = numbers.salePrice
    ? `<span>Estimated fees <strong>${currency(numbers.fees)}</strong></span><span>Net profit <strong>${currency(numbers.netProfit)}</strong></span><span>Net ROI <strong>${Math.round(numbers.roiPercent)}%</strong></span><span class="badge scout-${recommendation.toLowerCase().replaceAll(" ", "-")}">${recommendation}</span>`
    : `<span>Enter an expected eBay sale price and research confidence to calculate the opportunity.</span>`;
}

function requestScoutData() {
  window.postMessage({ source: "reseller-command-center", type: "REQUEST_SCOUT_DATA" }, window.location.origin);
  setTimeout(() => toast("If the extension has scanned listings, they will appear here."), 250);
}

function renderSettings() {
  $("defaultMarketplace").value = settings.defaultMarketplace;
  $("staleDays").value = settings.staleDays;
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderSales();
  renderScout();
  renderMarketplaceCards();
  renderEbayListingReview();
  renderSettings();
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewId));
  if (history.replaceState) history.replaceState(null, "", `#${viewId}`);
}

function openItemDialog(id = "") {
  const item = id ? items.find(i => i.id === id) : null;
  $("dialogTitle").textContent = item ? "Edit Item" : "Add Item";
  $("deleteItemBtn").style.visibility = item ? "visible" : "hidden";
  $("itemForm").reset();
  $("itemId").value = item?.id || "";
  $("title").value = item?.title || "";
  $("brand").value = item?.brand || "";
  $("category").value = item?.category || "";
  $("purchaseCost").value = item?.purchaseCost ?? "";
  $("purchaseDate").value = item?.purchaseDate || new Date().toISOString().slice(0,10);
  $("source").value = item?.source || "";
  $("storage").value = item?.storage || "";
  $("status").value = item?.status || "Unlisted";
  $("listPrice").value = item?.listPrice ?? "";
  $("saleMarketplace").value = item?.saleMarketplace || "";
  $("saleDate").value = item?.saleDate || "";
  $("salePrice").value = item?.salePrice || "";
  $("shippingCollected").value = item?.shippingCollected || "";
  $("fees").value = item?.fees || "";
  $("shippingCost").value = item?.shippingCost || "";
  $("otherExpenses").value = item?.otherExpenses || "";
  $("notes").value = item?.notes || "";

  renderMarketplaceChecks(item?.listedMarketplaces || [settings.defaultMarketplace]);
  $("itemDialog").showModal();
}

function renderMarketplaceChecks(selected = []) {
  $("marketplaceChecks").innerHTML = marketplaces.map(name => `
    <label><input type="checkbox" value="${escapeHtml(name)}" ${selected.includes(name) ? "checked" : ""}> ${escapeHtml(name)}</label>
  `).join("");
}

function readFormItem() {
  const selected = [...$("marketplaceChecks").querySelectorAll("input:checked")].map(i => i.value);
  const status = $("saleMarketplace").value || $("saleDate").value || $("salePrice").value ? "Sold" : $("status").value;
  return {
    id: $("itemId").value || crypto.randomUUID(),
    title: $("title").value.trim(),
    brand: $("brand").value.trim(),
    category: $("category").value.trim(),
    purchaseCost: Number($("purchaseCost").value || 0),
    purchaseDate: $("purchaseDate").value,
    source: $("source").value.trim(),
    storage: $("storage").value.trim(),
    status,
    listPrice: Number($("listPrice").value || 0),
    listedMarketplaces: selected,
    saleMarketplace: $("saleMarketplace").value,
    saleDate: $("saleDate").value,
    salePrice: Number($("salePrice").value || 0),
    shippingCollected: Number($("shippingCollected").value || 0),
    fees: Number($("fees").value || 0),
    shippingCost: Number($("shippingCost").value || 0),
    otherExpenses: Number($("otherExpenses").value || 0),
    notes: $("notes").value.trim()
  };
}

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    settings,
    items,
    opportunities
  };
  downloadBlob(JSON.stringify(payload, null, 2), "reseller-command-center-backup.json", "application/json");
}

function exportCsv() {
  const headers = [
    "id","title","brand","category","purchaseCost","purchaseDate","source","storage","status",
    "listPrice","listedMarketplaces","saleMarketplace","saleDate","salePrice","shippingCollected",
    "fees","shippingCost","otherExpenses","notes"
  ];
  const rows = items.map(item => headers.map(h => {
    let value = item[h] ?? "";
    if (Array.isArray(value)) value = value.join("|");
    return `"${String(value).replaceAll('"','""')}"`;
  }).join(","));
  downloadBlob([headers.join(","), ...rows].join("\n"), "reseller-inventory.csv", "text/csv");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function importCloudItems(importedItems) {
  if (!Array.isArray(importedItems) || importedItems.length === 0) return 0;

  const normalized = importedItems.map(item => ({
    ...item,
    id: item.id || crypto.randomUUID()
  }));

  const payload = normalized.map(itemToDatabase);
  const { error } = await supabaseClient
    .from("inventory_items")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
  await loadCloudInventory();
  return normalized.length;
}

async function importFile(file) {
  const text = await file.text();

  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    const importedItems = Array.isArray(data) ? data : data.items || [];

    if (data.settings) {
      settings = { ...settings, ...data.settings };
      saveSettings();
    }
    if (Array.isArray(data.opportunities)) {
      opportunities = data.opportunities;
      localStorage.setItem(OPPORTUNITIES_KEY, JSON.stringify(opportunities));
      renderScout();
    }

    const count = await importCloudItems(importedItems);
    toast(`${count} inventory items imported to cloud`);
    return;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV contains no rows.");

  const headers = parseCsvLine(lines[0]);
  const imported = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] ?? "");
    ["purchaseCost","listPrice","salePrice","shippingCollected","fees","shippingCost","otherExpenses"]
      .forEach(k => obj[k] = Number(obj[k] || 0));
    obj.listedMarketplaces = (obj.listedMarketplaces || "").split("|").filter(Boolean);
    obj.id = obj.id || crypto.randomUUID();
    return obj;
  });

  const count = await importCloudItems(imported);
  toast(`${count} items imported to cloud`);
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i+1];
    if (char === '"' && quoted && next === '"') {
      current += '"'; i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(current); current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => showView(tab.dataset.view)));
document.querySelectorAll("[data-jump]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.jump)));

$("addItemBtn").addEventListener("click", () => openItemDialog());
$("closeDialogBtn").addEventListener("click", () => $("itemDialog").close());
$("cancelBtn").addEventListener("click", () => $("itemDialog").close());

$("itemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = readFormItem();
  if (!record.title || !record.purchaseDate) return;
  const index = items.findIndex(i => i.id === record.id);
  try {
    const saved = await saveCloudItem(record);
    if (index >= 0) items[index] = saved;
    else items.unshift(saved);
    renderAll();
    $("itemDialog").close();
    toast(index >= 0 ? "Item updated in cloud" : "Item added to cloud");
  } catch (error) {
    console.error("Cloud save failed:", error);
    alert("The item was not saved. Your existing inventory was not changed. " + error.message);
  }
});

$("deleteItemBtn").addEventListener("click", async () => {
  const id = $("itemId").value;
  if (!id || !confirm("Delete this item permanently?")) return;
  try {
    await deleteCloudItem(id);
    items = items.filter(i => i.id !== id);
    renderAll();
    $("itemDialog").close();
    toast("Item deleted from cloud");
  } catch (error) {
    console.error("Cloud delete failed:", error);
    alert("The item was not deleted. " + error.message);
  }
});

$("inventorySearch").addEventListener("input", renderInventory);
$("statusFilter").addEventListener("change", renderInventory);
$("marketplaceFilter").addEventListener("change", renderInventory);

$("scoutSearch").addEventListener("input", renderScout);
$("scoutRecommendationFilter").addEventListener("change", renderScout);
$("scoutCategoryFilter").addEventListener("change", renderScout);
$("requestScoutBtn").addEventListener("click", requestScoutData);
$("dismissScoutGuide").addEventListener("click", () => $("scoutGuide").remove());
$("exportScoutBtn").addEventListener("click", () => {
  downloadBlob(JSON.stringify({ exportedAt: new Date().toISOString(), listings: opportunities }, null, 2), "reseller-sourcing-opportunities.json", "application/json");
});
$("scoutImportFile").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const listings = Array.isArray(data) ? data : data.listings || data.opportunities || [];
    const added = importScoutListings(listings);
    toast(added ? `${added} new listing${added === 1 ? "" : "s"} imported` : "No new listings found");
  } catch (error) {
    alert(`Scout import failed: ${error.message}`);
  }
  event.target.value = "";
});

$("clearScoutBtn").addEventListener("click", () => {
  if (!confirm("Clear all sourcing opportunities from this browser? Your inventory and sales will not be affected.")) return;
  opportunities = [];
  saveOpportunities();
  toast("Sourcing opportunities cleared");
});

$("closeOpportunityDialogBtn").addEventListener("click", () => $("opportunityDialog").close());
$("cancelOpportunityBtn").addEventListener("click", () => $("opportunityDialog").close());
$("opportunityForm").addEventListener("input", () => {
  updateOpportunityCalculation();
  $("ebayResearchBtn").href = soldSearchUrl($("opportunityTitle").value);
});
$("opportunityForm").addEventListener("submit", event => {
  event.preventDefault();
  const record = readOpportunityForm();
  const index = opportunities.findIndex(item => item.id === record.id);
  if (index >= 0) opportunities[index] = record;
  saveOpportunities();
  $("opportunityDialog").close();
  toast("Evaluation saved");
});
$("deleteOpportunityBtn").addEventListener("click", () => {
  const id = $("opportunityId").value;
  if (!id || !confirm("Delete this sourcing opportunity?")) return;
  opportunities = opportunities.filter(item => item.id !== id);
  saveOpportunities();
  $("opportunityDialog").close();
  toast("Opportunity deleted");
});

window.addEventListener("message", event => {
  if (event.source !== window || event.data?.source !== "marketplace-scout" || event.data?.type !== "SCOUT_DATA") return;
  const added = importScoutListings(event.data.listings || []);
  if (added) {
    showView("sourcing");
    toast(`${added} new Marketplace listing${added === 1 ? "" : "s"} imported`);
  }
  window.postMessage({ source: "reseller-command-center", type: "SCOUT_DATA_IMPORTED" }, window.location.origin);
});

$("saveSettingsBtn").addEventListener("click", () => {
  settings.defaultMarketplace = $("defaultMarketplace").value;
  settings.staleDays = Number($("staleDays").value || 90);
  saveSettings();
  renderAll();
  toast("Settings saved");
});

$("exportBtn").addEventListener("click", exportCsv);
$("exportBackupBtn").addEventListener("click", exportJson);

$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try { await importFile(file); }
  catch (error) { alert(`Import failed: ${error.message}`); }
  event.target.value = "";
});

$("clearDataBtn").addEventListener("click", () => {
  alert("Bulk cloud deletion is disabled for safety. Delete individual inventory items instead.");
});

$("loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const message = $("loginMessage");
  const button = event.currentTarget.querySelector('button[type="submit"]');

  if (message) message.textContent = "Signing in...";
  if (button) button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (message) message.textContent = "";
  } catch (error) {
    console.error("Sign-in failed:", error);
    if (message) message.textContent = error?.message || "Sign-in failed. Check your email and password and try again.";
  } finally {
    if (button) button.disabled = false;
  }
});

$("signOutBtn")?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  items = [];
  renderAll();
  toast("Signed out");
});

renderMarketplaceChecks();
renderAll();
if (typeof supabaseClient === "undefined") {
  const gateMessage = document.querySelector("#authGate .auth-card p");
  if (gateMessage) gateMessage.textContent = "Cloud services could not be loaded. Refresh this page and try again.";
} else {
  initializeAuthentication().catch(error => {
    console.error("Authentication initialization failed:", error);
    const gateMessage = document.querySelector("#authGate .auth-card p");
    if (gateMessage) gateMessage.textContent = "Could not connect to cloud inventory. Refresh this page and try again.";
  });
}
const initialView = location.hash.slice(1);
if (document.getElementById(initialView)?.classList.contains("view")) showView(initialView);
if (initialView === "sourcing") setTimeout(requestScoutData, 300);
