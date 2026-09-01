const STORAGE_KEY = "resellerCommandCenter.items.v1";
const SETTINGS_KEY = "resellerCommandCenter.settings.v1";

const marketplaces = [
  "eBay",
  "Poshmark",
  "Depop",
  "Etsy",
  "Facebook Marketplace",
  "Mercari",
  "Other"
];

const sampleItems = [
  {
    id: crypto.randomUUID(),
    title: "Three aqua Fiesta coffee mugs",
    brand: "Fiesta",
    category: "Drinkware",
    purchaseCost: 3,
    purchaseDate: "2026-07-20",
    source: "Thrift store",
    storage: "Sold",
    status: "Sold",
    listPrice: 31.40,
    listedMarketplaces: ["eBay"],
    saleMarketplace: "eBay",
    saleDate: "2026-07-28",
    salePrice: 31.40,
    shippingCollected: 5.99,
    fees: 5.15,
    shippingCost: 5.99,
    otherExpenses: 0,
    notes: "First eBay sale."
  },
  {
    id: crypto.randomUUID(),
    title: "Anchor Hocking cake plate",
    brand: "Anchor Hocking",
    category: "Serveware",
    purchaseCost: 4,
    purchaseDate: "2026-07-05",
    source: "Thrift store",
    storage: "Shelf A-2",
    status: "Listed",
    listPrice: 34.99,
    listedMarketplaces: ["eBay", "Facebook Marketplace"],
    saleMarketplace: "",
    saleDate: "",
    salePrice: 0,
    shippingCollected: 0,
    fees: 0,
    shippingCost: 0,
    otherExpenses: 0,
    notes: "Base has Anchor Hocking logo."
  }
];

let items = loadItems();
let settings = loadSettings();

const $ = (id) => document.getElementById(id);
const currency = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
}).format(Number(value || 0));

function loadItems() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleItems));
  return sampleItems;
}

function loadSettings() {
  const defaults = { defaultMarketplace: "eBay", staleDays: 90 };
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) return defaults;
  try { return { ...defaults, ...JSON.parse(stored) }; } catch { return defaults; }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  renderAll();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

function renderSettings() {
  $("defaultMarketplace").value = settings.defaultMarketplace;
  $("staleDays").value = settings.staleDays;
}

function renderAll() {
  renderDashboard();
  renderInventory();
  renderSales();
  renderMarketplaceCards();
  renderSettings();
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === viewId));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === viewId));
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
    items
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

async function importFile(file) {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    items = Array.isArray(data) ? data : data.items || [];
    if (data.settings) settings = { ...settings, ...data.settings };
    saveSettings();
    saveItems();
    toast("Backup imported");
    return;
  }

  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV contains no rows.");
  const headers = parseCsvLine(lines[0]);
  const imported = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] ?? "");
    ["purchaseCost","listPrice","salePrice","shippingCollected","fees","shippingCost","otherExpenses"].forEach(k => obj[k] = Number(obj[k] || 0));
    obj.listedMarketplaces = (obj.listedMarketplaces || "").split("|").filter(Boolean);
    obj.id = obj.id || crypto.randomUUID();
    return obj;
  });
  items = [...items, ...imported];
  saveItems();
  toast(`${imported.length} items imported`);
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

$("itemForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const record = readFormItem();
  if (!record.title || !record.purchaseDate) return;
  const index = items.findIndex(i => i.id === record.id);
  if (index >= 0) items[index] = record;
  else items.unshift(record);
  saveItems();
  $("itemDialog").close();
  toast(index >= 0 ? "Item updated" : "Item added");
});

$("deleteItemBtn").addEventListener("click", () => {
  const id = $("itemId").value;
  if (!id || !confirm("Delete this item permanently?")) return;
  items = items.filter(i => i.id !== id);
  saveItems();
  $("itemDialog").close();
  toast("Item deleted");
});

$("inventorySearch").addEventListener("input", renderInventory);
$("statusFilter").addEventListener("change", renderInventory);
$("marketplaceFilter").addEventListener("change", renderInventory);

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
  if (!confirm("Clear all inventory and sales data from this browser?")) return;
  items = [];
  saveItems();
  toast("All data cleared");
});

renderMarketplaceChecks();
renderAll();
