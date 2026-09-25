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
  renderAll();
  await verifySupabaseAccess();
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
    cost_status: item.costStatus || "known",
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
    notes: item.notes || null,
    listing_description: item.listingDescription || null,
    item_condition: item.itemCondition || null,
    research_notes: item.researchNotes || null,
    draft_status: item.draftStatus || "inventory"
  };
}

function databaseToItem(row) {
  return {
    id: row.id, title: row.title, brand: row.brand || "", category: row.category || "",
    purchaseCost: Number(row.purchase_cost || 0), costStatus: row.cost_status || "known", purchaseDate: row.purchase_date || "",
    source: row.source || "", storage: row.storage_location || "", status: row.status || "Unlisted",
    listPrice: Number(row.list_price || 0), listedMarketplaces: row.listed_marketplaces || [],
    saleMarketplace: row.sale_marketplace || "", saleDate: row.sale_date || "",
    salePrice: Number(row.sale_price || 0), shippingCollected: Number(row.shipping_collected || 0),
    fees: Number(row.fees || 0), shippingCost: Number(row.shipping_cost || 0),
    otherExpenses: Number(row.other_expenses || 0), notes: row.notes || "",
    listingDescription: row.listing_description || "", itemCondition: row.item_condition || "",
    researchNotes: row.research_notes || "", draftStatus: row.draft_status || "inventory"
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
  if (item.costStatus === "unknown") return null;
  return Number(item.salePrice || 0)
    + Number(item.shippingCollected || 0)
    - Number(item.purchaseCost || 0)
    - Number(item.fees || 0)
    - Number(item.shippingCost || 0)
    - Number(item.otherExpenses || 0);
}

function roi(item) {
  if (item.costStatus === "unknown" || item.costStatus === "free") return null;
  const cost = Number(item.purchaseCost || 0);
  const net = profit(item);
  return cost > 0 && net !== null ? (net / cost) * 100 : null;
}

function daysBetween(start, end = new Date().toISOString().slice(0, 10)) {
  if (!start || !end) return null;
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
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
  const soldWithKnownCost = sold.filter(i => i.costStatus !== "unknown");
  const net = soldWithKnownCost.reduce((sum, i) => sum + (profit(i) || 0), 0);
  const activeKnownCost = active.filter(i => i.costStatus !== "unknown");
  const activeCost = activeKnownCost.reduce((sum, i) => sum + Number(i.purchaseCost || 0), 0);
  const soldWithRoi = sold.filter(i => roi(i) !== null);
  const avgRoi = soldWithRoi.length ? soldWithRoi.reduce((sum, i) => sum + roi(i), 0) / soldWithRoi.length : null;
  const soldWithDates = sold.filter(i => daysBetween(i.purchaseDate, i.saleDate) !== null);
  const avgDays = soldWithDates.length ? soldWithDates.reduce((sum, i) => sum + daysBetween(i.purchaseDate, i.saleDate), 0) / soldWithDates.length : null;

  $("netProfit").textContent = currency(net);
  $("grossSales").textContent = currency(gross);
  $("activeInventory").textContent = active.length;
  $("inventoryCost").textContent = currency(activeCost);
  $("averageRoi").textContent = avgRoi === null ? "—" : `${Math.round(avgRoi)}%`;
  $("avgDays").textContent = avgDays === null ? "—" : Math.round(avgDays);

  renderMarketplaceBars(sold);
  renderAttention(active);
  renderRecentItems();
}

function renderMarketplaceBars(sold) {
  const totals = {};
  sold.forEach(item => {
    const key = item.saleMarketplace || "Other";
    totals[key] = (totals[key] || 0) + (profit(item) || 0);
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
      <td>${item.status === "Sold" ? item.costStatus === "unknown" ? "—" : currency(profit(item)) : "—"}</td>
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
      <td>${daysBetween(item.purchaseDate, item.saleDate || new Date().toISOString().slice(0, 10)) ?? "—"}</td>
      <td><button class="text-button edit-item" data-id="${item.id}">Edit</button></td>
    </tr>
  `).join("") : `<tr><td colspan="9" class="empty">No matching inventory.</td></tr>`;

  document.querySelectorAll(".edit-item").forEach(btn => {
    btn.addEventListener("click", () => openItemDialog(btn.dataset.id));
  });
}


function needsCompletion(item) {
  const imported = String(item.source || "").startsWith("Imported from eBay");
  return imported && (!item.storage || !item.purchaseDate || item.costStatus === "unknown" || item.source === "Imported from eBay" || item.source === "Imported from eBay Draft");
}
function renderCompleteInventory() {
  const queue = items.filter(needsCompletion);
  const imported = items.filter(i => String(i.source || "").startsWith("Imported from eBay"));
  const missingCost = imported.filter(i => i.costStatus === "unknown").length;
  const missingStorage = imported.filter(i => !i.storage).length;
  const missingDate = imported.filter(i => !i.purchaseDate).length;
  if (!$("completeInventoryTable")) return;
  $("completeCount").textContent = queue.length;
  $("missingCostCount").textContent = missingCost;
  $("missingStorageCount").textContent = missingStorage;
  $("missingDateCount").textContent = missingDate;
  $("completeInventoryTable").innerHTML = queue.length ? queue.map(item => `
    <tr data-complete-id="${item.id}">
      <td><input class="complete-select" type="checkbox" data-id="${item.id}" aria-label="Select ${escapeHtml(item.title)}"></td>
      <td><div class="item-title">${escapeHtml(item.title)}</div><div class="item-meta">${escapeHtml(item.status)}</div></td>
      <td><div class="cost-entry"><select class="complete-cost-status compact-input"><option value="unknown" ${item.costStatus==="unknown"?"selected":""}>Unknown</option><option value="known" ${item.costStatus==="known"?"selected":""}>Known</option><option value="free" ${item.costStatus==="free"?"selected":""}>Free</option></select><input class="complete-cost compact-input" type="number" min="0" step=".01" value="${item.costStatus==="known" ? Number(item.purchaseCost||0) : ""}" placeholder="Cost"></div></td>
      <td><input class="complete-storage compact-input" value="${escapeHtml(item.storage || "")}" placeholder="BIN / shelf"></td>
      <td><input class="complete-date compact-input" type="date" value="${escapeHtml(item.purchaseDate || "")}"></td>
      <td><input class="complete-source compact-input" value="${String(item.source||"").startsWith("Imported from eBay") ? "" : escapeHtml(item.source||"")}" placeholder="Goodwill, estate sale..."></td>
      <td><button class="secondary complete-save" data-id="${item.id}" type="button">Save</button></td>
    </tr>`).join("") : '<tr><td colspan="7" class="empty">Everything is complete. Nice work!</td></tr>';
  document.querySelectorAll(".complete-save").forEach(btn => btn.addEventListener("click", () => saveCompleteRow(btn.dataset.id)));
}
async function saveCompleteRow(id) {
  const item = items.find(i => i.id === id), row=document.querySelector('[data-complete-id="'+id+'"]'); if(!item||!row)return;
  const costStatus=row.querySelector(".complete-cost-status").value; const costValue=Number(row.querySelector(".complete-cost").value||0); if(costStatus==="known" && costValue<0){toast("Enter a valid cost");return;} const updated={...item,costStatus,purchaseCost:costStatus==="free"?0:costValue,storage:row.querySelector(".complete-storage").value.trim(),purchaseDate:row.querySelector(".complete-date").value,source:row.querySelector(".complete-source").value.trim()||item.source};
  try { const saved=await saveCloudItem(updated); items[items.findIndex(i=>i.id===id)]=saved; renderAll(); toast("Inventory details saved"); } catch(error){alert("Could not save this item. "+error.message);}
}
async function applyBulkCompletion() {
  const ids=[...document.querySelectorAll(".complete-select:checked")].map(x=>x.dataset.id); if(!ids.length){toast("Select at least one item");return;}
  const storage=$("bulkStorage").value.trim(), source=$("bulkSource").value.trim(); if(!storage&&!source){toast("Enter a storage location or source");return;}
  const button=$("applyBulkCompleteBtn"); button.disabled=true;
  try { for(const id of ids){const item=items.find(i=>i.id===id);if(!item)continue;await saveCloudItem({...item,storage:storage||item.storage,source:source||item.source});} await loadCloudInventory(); toast(ids.length+" items updated"); } catch(error){alert("Bulk update stopped. "+error.message);} finally {button.disabled=false;}
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
  renderCompleteInventory();
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


function renderMasterDrafts() {
  const table=$("masterDraftTable"); if(!table)return;
  const filter=$("draftStatusFilter")?.value||"";
  const drafts=items.filter(i=>["draft","approved","exported"].includes(i.draftStatus)).filter(i=>!filter||i.draftStatus===filter);
  table.innerHTML=drafts.length?drafts.map(i=>`<tr><td><div class="item-title">${escapeHtml(i.title)}</div><div class="item-meta">${escapeHtml(i.brand||"")}</div></td><td>${escapeHtml(i.itemCondition||"—")}</td><td>${currency(i.listPrice||0)}</td><td><span class="badge">${escapeHtml(i.draftStatus)}</span></td><td><button class="secondary review-master-draft" data-id="${i.id}" type="button">Review</button></td></tr>`).join(""):'<tr><td colspan="5" class="empty">No master drafts yet. Send an item through the Listing Agent to create one.</td></tr>';
  document.querySelectorAll(".review-master-draft").forEach(b=>b.addEventListener("click",()=>openMasterDraft(b.dataset.id)));
}
function openMasterDraft(id){
 const i=items.find(x=>x.id===id); if(!i)return;
 $("masterDraftId").value=i.id;$("masterDraftHeading").textContent=i.title||"Review Draft";$("masterDraftTitle").value=i.title||"";$("masterDraftBrand").value=i.brand||"";$("masterDraftCategory").value=i.category||"";$("masterDraftPrice").value=Number(i.listPrice||0)||"";$("masterDraftStatus").value=i.draftStatus||"draft";$("masterDraftCondition").value=i.itemCondition||"";$("masterDraftDescription").value=i.listingDescription||"";$("masterDraftResearch").value=i.researchNotes||"";$("masterDraftDialog").showModal();
}
async function saveMasterDraft(approve=false){
 const id=$("masterDraftId").value,i=items.find(x=>x.id===id);if(!i)return;
 const updated={...i,title:$("masterDraftTitle").value.trim()||i.title,brand:$("masterDraftBrand").value.trim(),category:$("masterDraftCategory").value.trim(),listPrice:Number($("masterDraftPrice").value||0),itemCondition:$("masterDraftCondition").value.trim(),listingDescription:$("masterDraftDescription").value.trim(),researchNotes:$("masterDraftResearch").value.trim(),draftStatus:approve?"approved":$("masterDraftStatus").value};
 try{const saved=await saveCloudItem(updated);items[items.findIndex(x=>x.id===id)]=saved;renderAll();$("masterDraftDialog").close();toast(approve?"Master draft approved":"Master draft saved");}catch(e){alert("Could not save master draft. "+e.message);}
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderCompleteInventory();
  renderMasterDrafts();
  renderSales();
  renderScout();
  renderMarketplaceCards();
  renderSettings();
}

$("draftStatusFilter")?.addEventListener("change",renderMasterDrafts);
$("closeMasterDraftBtn")?.addEventListener("click",()=>$("masterDraftDialog")?.close());
$("saveMasterDraftBtn")?.addEventListener("click",()=>saveMasterDraft(false));
$("approveMasterDraftBtn")?.addEventListener("click",()=>saveMasterDraft(true));

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewId));
  if (history.replaceState) history.replaceState(null, "", `#${viewId}`);
}


let batchListingPhotos = [];
let batchListingGroups = [];
let batchManualGroups = null;
let batchSelectedPhotos = new Set();

function resetBatchGroups() {
  batchManualGroups = null;
  batchListingGroups = batchListingPhotos.length ? [{ start: 0, end: batchListingPhotos.length - 1 }] : [];
}

async function batchPhotoFingerprint(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 12; canvas.height = 12;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, 12, 12);
  bitmap.close?.();
  const data = ctx.getImageData(0, 0, 12, 12).data;
  const gray = [], rgb = [0,0,0];
  for (let i=0; i<data.length; i+=4) {
    const r=data[i], g=data[i+1], b=data[i+2];
    gray.push((r*0.299)+(g*0.587)+(b*0.114));
    rgb[0]+=r; rgb[1]+=g; rgb[2]+=b;
  }
  const avg = gray.reduce((x,y)=>x+y,0)/gray.length;
  return {
    hash: gray.map(v => v >= avg ? 1 : 0),
    rgb: rgb.map(v => v/gray.length)
  };
}

function batchVisualDistance(a,b) {
  let hashDiff=0;
  for(let i=0;i<a.hash.length;i++) if(a.hash[i]!==b.hash[i]) hashDiff++;
  const hashDistance=hashDiff/a.hash.length;
  const colorDistance=Math.sqrt(a.rgb.reduce((sum,v,i)=>sum+Math.pow(v-b.rgb[i],2),0))/(255*Math.sqrt(3));
  return (hashDistance*0.75)+(colorDistance*0.25);
}

async function proposeBatchGroups() {
  if (!batchListingPhotos.length) return;
  const button=$("batchAutoGroupBtn");
  if(button){ button.disabled=true; button.textContent="Comparing Photos…"; }
  try {
    const fingerprints=await Promise.all(batchListingPhotos.map(batchPhotoFingerprint));
    const boundaries=[];
    for(let i=0;i<batchListingPhotos.length-1;i++){
      const visual=batchVisualDistance(fingerprints[i],fingerprints[i+1]);
      const a=Number(batchListingPhotos[i].lastModified||0);
      const b=Number(batchListingPhotos[i+1].lastModified||0);
      const minutes=(a&&b)?Math.max(0,b-a)/60000:0;
      // Visual change is primary. Time can strengthen a visual boundary, but never creates one alone.
      const timeBoost=visual>=0.28 ? Math.min(minutes/15,1)*0.08 : 0;
      boundaries.push({index:i,score:visual+timeBoost,visual});
    }
    const scores=boundaries.map(x=>x.score).sort((x,y)=>x-y);
    const median=scores[Math.floor(scores.length/2)]||0;
    const threshold=Math.max(0.34,median*1.35);
    const cuts=boundaries.filter(x=>x.visual>=0.28 && x.score>=threshold).map(x=>x.index);
    if(!cuts.length){ resetBatchGroups(); renderBatchIntake(); return; }
    let start=0;
    batchListingGroups=cuts.map(end=>{const group={start,end};start=end+1;return group;});
    batchListingGroups.push({start,end:batchListingPhotos.length-1});
    renderBatchIntake();
  } catch(err) {
    console.error("Batch visual grouping failed",err);
    resetBatchGroups(); renderBatchIntake();
    toast("Could not compare these photos. You can still split them manually.");
  } finally {
    if(button){ button.disabled=false; button.textContent="Suggest Item Groups"; }
  }
}

function currentBatchGroupIndexes() {
  if (batchManualGroups) return batchManualGroups;
  return batchListingGroups.map(group => Array.from({length: group.end-group.start+1}, (_,i)=>group.start+i));
}

function renderBatchIntake() {
  const tray=$("batchPhotoTray"), groups=$("batchGroups"), controls=$("batchGroupControls"), count=$("batchPhotoCount"), split=$("batchSplitAfter");
  if(!tray||!groups||!controls||!count||!split)return;
  count.textContent=batchListingPhotos.length+" photo"+(batchListingPhotos.length===1?"":"s");
  tray.innerHTML=batchListingPhotos.map((file,i)=>`<figure><img src="${URL.createObjectURL(file)}" alt="Batch photo ${i+1}"><figcaption>${i+1}</figcaption></figure>`).join("");
  controls.hidden=batchListingPhotos.length<2;
  split.innerHTML=batchListingPhotos.slice(0,-1).map((_,i)=>`<option value="${i}">${i+1}</option>`).join("");
  let groupIndexes=currentBatchGroupIndexes();
  const assigned=new Set(groupIndexes.flat());
  const unassigned=batchListingPhotos.map((_,i)=>i).filter(i=>!assigned.has(i));
  if(unassigned.length){
    batchManualGroups=groupIndexes.map(g=>[...g]);
    batchManualGroups.push(unassigned);
    groupIndexes=batchManualGroups;
  }
  groups.innerHTML=groupIndexes.map((indexes,gi)=>`<article class="batch-group-card" data-group="${gi}">
    <div class="batch-group-heading"><strong>${gi===groupIndexes.length-1 && unassigned.length ? "Unassigned Photos" : "Item "+(gi+1)}</strong><span>${indexes.length} photo${indexes.length===1?"":"s"}</span></div>
    <div class="batch-group-thumbs batch-drop-target" data-group="${gi}">${indexes.map(idx=>`<figure class="batch-draggable ${batchSelectedPhotos.has(idx) ? "selected" : ""}" draggable="true" data-photo="${idx}"><img src="${URL.createObjectURL(batchListingPhotos[idx])}" alt="Item ${gi+1} photo"><figcaption>${idx+1}</figcaption></figure>`).join("")}</div>
    <div class="batch-group-actions"><button class="primary use-batch-group" type="button" data-group="${gi}">Open in Listing Agent</button><button class="danger ghost delete-batch-group" type="button" data-group="${gi}">Delete Group</button></div>
  </article>`).join("")+`<button id="batchAddGroupBtn" class="secondary" type="button">+ Add Empty Item Group</button>`;

  document.querySelectorAll(".batch-draggable").forEach(el=>{
    el.addEventListener("click",e=>{
      const photo=Number(el.dataset.photo);
      if(e.shiftKey || e.metaKey || e.ctrlKey){
        if(batchSelectedPhotos.has(photo)) batchSelectedPhotos.delete(photo); else batchSelectedPhotos.add(photo);
      } else { batchSelectedPhotos.clear(); batchSelectedPhotos.add(photo); }
      document.querySelectorAll(".batch-draggable").forEach(node=>{
        node.classList.toggle("selected",batchSelectedPhotos.has(Number(node.dataset.photo)));
      });
      $("batchHelp").textContent=batchSelectedPhotos.size+" photo"+(batchSelectedPhotos.size===1?"":"s")+" selected. Drag a selected photo to move them together.";
    });
    el.addEventListener("dragstart",e=>{
      const photo=Number(el.dataset.photo);
      if(!batchSelectedPhotos.has(photo)){ batchSelectedPhotos.clear(); batchSelectedPhotos.add(photo); }
      e.dataTransfer.setData("text/plain",[...batchSelectedPhotos].join(","));
      e.dataTransfer.effectAllowed="move"; el.classList.add("dragging");
    });
    el.addEventListener("dragend",()=>el.classList.remove("dragging"));
  });
  document.querySelectorAll(".batch-drop-target").forEach(zone=>{
    zone.addEventListener("dragover",e=>{e.preventDefault();zone.classList.add("drag-over");});
    zone.addEventListener("dragleave",()=>zone.classList.remove("drag-over"));
    zone.addEventListener("drop",e=>{
      e.preventDefault(); zone.classList.remove("drag-over");
      const photos=e.dataTransfer.getData("text/plain").split(",").map(Number).filter(Number.isInteger), target=Number(zone.dataset.group);
      if(!photos.length||!Number.isInteger(target))return;
      batchManualGroups=currentBatchGroupIndexes().map(g=>[...g]);
      batchManualGroups.forEach(g=>photos.forEach(photo=>{const p=g.indexOf(photo);if(p>=0)g.splice(p,1);}));
      batchManualGroups[target].push(...photos);
      batchSelectedPhotos.clear();
      batchManualGroups=batchManualGroups.filter(g=>g.length);
      renderBatchIntake();
      $("batchHelp").textContent="Manual layout active. Drag any photo between item groups until it looks right. Nothing has been saved.";
    });
  });
  $("batchAddGroupBtn")?.addEventListener("click",()=>{batchManualGroups=currentBatchGroupIndexes().map(g=>[...g]);batchManualGroups.push([]);renderBatchIntake();});
  document.querySelectorAll(".delete-batch-group").forEach(button=>button.addEventListener("click",()=>{
    const target=Number(button.dataset.group);
    const existing=currentBatchGroupIndexes().map(g=>[...g]);
    const removed=existing.splice(target,1)[0]||[];
    if(removed.length) existing.push(removed);
    batchManualGroups=existing;
    batchSelectedPhotos.clear();
    renderBatchIntake();
    $("batchHelp").textContent="Group deleted. Its photos are still available in the workspace.";
  }));
  document.querySelectorAll(".use-batch-group").forEach(button=>button.addEventListener("click",()=>{
    const indexes=currentBatchGroupIndexes()[Number(button.dataset.group)]||[];
    listingAgentPhotos=indexes.map(i=>batchListingPhotos[i]);
    renderListingAgentPhotos();
    $("listingAgentStatus").textContent="Item group ready";
    $("listingAgentMessage").textContent="This group's photos are loaded below. Add any business details you know, then create the master listing draft.";
    $("listingPhotoPreview").scrollIntoView({behavior:"smooth",block:"center"});
  }));
}

function splitBatchAfter(index) {
  if (!batchListingPhotos.length || index < 0 || index >= batchListingPhotos.length - 1) return;
  const cuts = new Set([index]);
  batchListingGroups.forEach(group => { if (group.end < batchListingPhotos.length - 1) cuts.add(group.end); });
  const sorted = [...cuts].sort((a, b) => a - b);
  let start = 0;
  batchListingGroups = sorted.map(end => { const group = { start, end }; start = end + 1; return group; });
  batchListingGroups.push({ start, end: batchListingPhotos.length - 1 });
  renderBatchIntake();
}

let listingAgentPhotos = [];
function renderListingAgentPhotos() {
  const box=$("listingPhotoPreview"), button=$("analyzeListingPhotosBtn"); if(!box||!button)return;
  box.innerHTML=listingAgentPhotos.map((file,i)=>`<figure><img src="${URL.createObjectURL(file)}" alt="Item photo ${i+1}"><figcaption>Photo ${i+1}</figcaption></figure>`).join("");
  button.disabled=!listingAgentPhotos.length; const museButton=$("sendToMuseBtn"); if(museButton)museButton.disabled=!listingAgentPhotos.length;
  $("listingAgentStatus").textContent=listingAgentPhotos.length ? listingAgentPhotos.length+" photo"+(listingAgentPhotos.length===1?"":"s")+" ready" : "Ready for photos";
  $("listingAgentMessage").textContent=listingAgentPhotos.length ? "Photos are staged locally. They have not been uploaded or added to inventory." : "Nothing will be added to inventory until you review and approve the draft.";
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
function batchPhotoSortKey(file) {
  const name = file.name || "";
  const stem = name.replace(/\.[^.]+$/, "");
  const numericParts = stem.match(/\d+/g) || [];
  const lastNumber = numericParts.length ? Number(numericParts[numericParts.length - 1]) : Number.NaN;
  return { name, lastNumber, modified: Number(file.lastModified || 0) };
}

function stableSortBatchPhotos(files) {
  return files.map((file, originalIndex) => ({ file, originalIndex, key: batchPhotoSortKey(file) }))
    .sort((a, b) => {
      const aHasNumber = Number.isFinite(a.key.lastNumber), bHasNumber = Number.isFinite(b.key.lastNumber);
      if (aHasNumber && bHasNumber && a.key.lastNumber !== b.key.lastNumber) return a.key.lastNumber - b.key.lastNumber;
      if (a.key.modified && b.key.modified && a.key.modified !== b.key.modified) return a.key.modified - b.key.modified;
      const byName = a.key.name.localeCompare(b.key.name, undefined, { numeric: true, sensitivity: "base" });
      return byName || a.originalIndex - b.originalIndex;
    }).map(entry => entry.file);
}

$("batchListingPhotos")?.addEventListener("change", e => {
  batchListingPhotos = stableSortBatchPhotos([...e.target.files]);
  resetBatchGroups();
  renderBatchIntake();
});
$("batchSplitBtn")?.addEventListener("click", () => splitBatchAfter(Number($("batchSplitAfter").value)));
$("batchAutoGroupBtn")?.addEventListener("click", proposeBatchGroups);
$("batchOneGroupBtn")?.addEventListener("click", () => { resetBatchGroups(); renderBatchIntake(); });
$("batchClearBtn")?.addEventListener("click", () => {
  batchListingPhotos = []; batchListingGroups = []; $("batchListingPhotos").value = ""; renderBatchIntake();
});
$("listingAgentPhotos")?.addEventListener("change", e => { listingAgentPhotos=[...e.target.files]; renderListingAgentPhotos(); });
function buildMuseHandoff(){
  const costStatus=$("agentCostStatus").value, cost=$("agentCost").value;
  const costLine=costStatus==="free"?"Free ($0)":costStatus==="known"&&cost?("$"+Number(cost).toFixed(2)):"Unknown";
  return `RESELLER COMMAND CENTER — EBAY LISTING JOB

I am attaching photos of one resale item. Please act as my listing agent.

1. Examine every photo carefully, including maker's marks, labels, signatures, model numbers, pattern details, condition and damage.
2. Identify the item as accurately as the evidence allows. Do not invent brand, model, age, material, provenance, dimensions or pattern.
3. Research appropriate eBay pricing/comparables if available.
4. Create a strong eBay title, select the best category, condition and relevant item specifics, and write an accurate buyer-friendly description.
5. Use the photos I attach for the listing.
6. Before publishing, show me the proposed title and price if you encounter meaningful uncertainty about identification or value. Otherwise proceed using my normal eBay account/session.
7. Publish the listing on eBay.
8. When finished, return the eBay item number, listing URL, final title, final list price and any important identification notes so I can record them in my Reseller Command Center.

MY BUSINESS-SIDE DETAILS
Cost: ${costLine}
Purchase source: ${$("agentSource").value.trim()||"Not provided"}
Storage location: ${$("agentStorage").value.trim()||"Not provided"}
Seller notes: ${$("agentNotes").value.trim()||"None"}

Important: Do not include my acquisition cost, purchase source or storage location in the public eBay listing. Those are private inventory details.`;
}
$("sendToMuseBtn")?.addEventListener("click",()=>{
  $("museHandoffText").value=buildMuseHandoff(); $("museHandoffPanel").hidden=false;
  $("listingAgentStatus").textContent="Muse package ready"; $("listingAgentMessage").textContent="Copy the instructions, then attach these same photos in Muse.";
  $("museHandoffPanel").scrollIntoView({behavior:"smooth",block:"start"});
});
$("copyMuseHandoffBtn")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("museHandoffText").value);toast("Muse instructions copied");}catch{ $("museHandoffText").select(); document.execCommand("copy"); toast("Muse instructions copied"); }});

let parsedMuseResult=null;
function parseMuseResult(text){
  const item=(text.match(/Item number:\s*([0-9]{9,15})/i)||text.match(/ebay\.com\/itm\/([0-9]{9,15})/i)||[])[1]||"";
  const url=(text.match(/https?:\/\/(?:www\.)?ebay\.com\/itm\/[0-9]+[^\s)]*/i)||[])[0]|| (item?`https://www.ebay.com/itm/${item}`:"");
  const title=(text.match(/(?:^|\n)[•*\-\s]*Title:\s*(.+)/i)||[])[1]?.trim()||"";
  const priceRaw=(text.match(/(?:^|\n)[•*\-\s]*Price:\s*\$?([0-9]+(?:\.[0-9]{1,2})?)/i)||[])[1]||"";
  const notes=(text.match(/(?:^|\n)[•*\-\s]*ID notes:\s*([\s\S]*?)(?=\n[•*\-\s]*(?:Two tiny things|For your records|Cost:|$))/i)||[])[1]?.trim()||"";
  const bin=(text.match(/(?:Bin|Storage(?: location)?):?\s*([A-Za-z0-9 _-]+)/i)||[])[1]?.trim()||"";
  const cost=(text.match(/\$([0-9]+(?:\.[0-9]{1,2})?)\s+from\s+/i)||[])[1]||"";
  const source=(text.match(/\$[0-9]+(?:\.[0-9]{1,2})?\s+from\s+([^\n.]+)/i)||[])[1]?.trim()||"";
  return {item,url,title,price:priceRaw?Number(priceRaw):0,notes,bin,cost:cost?Number(cost):null,source,raw:text};
}
$("parseMuseResultBtn")?.addEventListener("click",()=>{
  parsedMuseResult=parseMuseResult($("museResultText").value);
  const p=parsedMuseResult;
  if(!p.item||!p.title){toast("I need at least an eBay item number and title");return;}
  $("museResultPreview").hidden=false;
  $("museResultPreview").innerHTML=`<strong>${escapeHtml(p.title)}</strong><div class="item-meta">eBay #${escapeHtml(p.item)} · ${money(p.price)}</div><div class="item-meta">${p.bin?"Storage: "+escapeHtml(p.bin)+" · ":""}${p.cost!==null?"Cost: "+money(p.cost)+" · ":""}${p.source?"Source: "+escapeHtml(p.source):""}</div><p class="item-meta">Nothing has been saved yet.</p>`;
  $("saveMuseResultBtn").disabled=false;
});
$("saveMuseResultBtn")?.addEventListener("click",async()=>{
  const p=parsedMuseResult||parseMuseResult($("museResultText").value);
  if(!p.item||!p.title)return;
  const costStatus=$("agentCostStatus").value;
  const cost=p.cost!==null?p.cost:(costStatus==="free"?0:Number($("agentCost").value||0));
  const item={id:crypto.randomUUID(),title:p.title,brand:"",category:"",purchaseCost:cost,costStatus:p.cost!==null?"known":costStatus,purchaseDate:"",source:p.source||$("agentSource").value.trim(),storage:p.bin||$("agentStorage").value.trim(),status:"Listed",listPrice:p.price,listedMarketplaces:["eBay"],saleMarketplace:"",saleDate:"",salePrice:0,shippingCollected:0,fees:0,shippingCost:0,otherExpenses:0,notes:[p.notes,p.url?`eBay: ${p.url}`:"",p.item?`eBay item number: ${p.item}`:""].filter(Boolean).join("\n\n")};
  const button=$("saveMuseResultBtn"); button.disabled=true;
  try{
    const saved=await saveCloudItem(item);
    const {error}=await supabaseClient.from("marketplace_listings").upsert({inventory_item_id:saved.id,marketplace:"eBay",external_listing_id:p.item,listing_url:p.url||null,title:p.title,status:"active",price:p.price||null,currency:"USD",raw_data:{source:"Muse handoff",response:p.raw},listed_at:new Date().toISOString(),last_synced_at:new Date().toISOString()},{onConflict:"owner_id,marketplace,external_listing_id"});
    if(error)throw error;
    items.unshift(saved);renderAll();
    $("listingAgentStatus").textContent="Live on eBay ✓"; $("listingAgentMessage").textContent=`eBay #${p.item} is linked to the master inventory record.`;
    toast("eBay listing linked to inventory");
    $("museResultText").value="";$("museResultPreview").hidden=true;parsedMuseResult=null;
  }catch(error){alert("Nothing was changed intentionally if the save failed. Error: "+error.message);button.disabled=false;}
});

$("analyzeListingPhotosBtn")?.addEventListener("click", async () => {
  const button=$("analyzeListingPhotosBtn"); button.disabled=true;
  $("listingAgentStatus").textContent="Analyzing photos…"; $("listingAgentMessage").textContent="Building an editable listing draft.";
  try {
    const images=await Promise.all(listingAgentPhotos.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);})));
    const facts={cost:$("agentCost").value||null,cost_status:$("agentCostStatus").value,source:$("agentSource").value.trim(),storage:$("agentStorage").value.trim(),notes:$("agentNotes").value.trim()};
    const {data,error}=await supabaseClient.functions.invoke("listing-agent-analyze",{body:{images,facts}}); if(error) throw error; if(data?.error) throw new Error(data.error);
    const d=data.draft||{}; $("agentDraftTitle").value=d.title||""; $("agentDraftBrand").value=d.brand||""; $("agentDraftCategory").value=d.category||""; $("agentDraftCondition").value=d.condition||""; $("agentDraftPrice").value=d.suggested_price||""; $("agentDraftDescription").value=d.description||""; $("agentDraftResearch").value=d.research_notes||""; $("listingDraftPanel").hidden=false;
    $("listingAgentStatus").textContent="Draft ready for review"; $("listingAgentMessage").textContent="Review everything below. Nothing is saved until you approve it.";
  } catch(error) { $("listingAgentStatus").textContent="AI connection not ready"; $("listingAgentMessage").textContent=error.message||"Could not analyze these photos."; }
  finally {button.disabled=false;}
});
$("discardAgentDraftBtn")?.addEventListener("click",()=>{$("listingDraftPanel").hidden=true;$("listingAgentStatus").textContent="Photos ready";$("listingAgentMessage").textContent="Analyze again whenever you are ready.";});
$("approveAgentDraftBtn")?.addEventListener("click",async()=>{
  const costStatus=$("agentCostStatus").value, cost=costStatus==="free"?0:Number($("agentCost").value||0);
  const item={id:crypto.randomUUID(),title:$("agentDraftTitle").value.trim(),brand:$("agentDraftBrand").value.trim(),category:$("agentDraftCategory").value.trim(),purchaseCost:cost,costStatus,purchaseDate:new Date().toISOString().slice(0,10),source:$("agentSource").value.trim(),storage:$("agentStorage").value.trim(),status:"Unlisted",listPrice:Number($("agentDraftPrice").value||0),listedMarketplaces:[],saleMarketplace:"",saleDate:"",salePrice:0,shippingCollected:0,fees:0,shippingCost:0,otherExpenses:0,notes:[ $("agentDraftDescription").value.trim(), $("agentDraftCondition").value.trim() ? "Condition: "+$("agentDraftCondition").value.trim() : "", $("agentDraftResearch").value.trim() ? "AI research notes: "+$("agentDraftResearch").value.trim() : "" ].filter(Boolean).join("\n\n")};
  if(!item.title){toast("Give the listing a title first");return;}
  try{const saved=await saveCloudItem(item);items.unshift(saved);renderAll();$("listingDraftPanel").hidden=true;$("listingAgentStatus").textContent="Added to inventory";$("listingAgentMessage").textContent="The approved draft is now a master inventory item. Marketplace publishing comes next.";toast("Listing added to inventory");}catch(error){alert("Could not add listing. "+error.message);}
});
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
$("applyBulkCompleteBtn")?.addEventListener("click", applyBulkCompletion);
$("selectAllComplete")?.addEventListener("change", e => document.querySelectorAll(".complete-select").forEach(x => x.checked=e.target.checked));
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
