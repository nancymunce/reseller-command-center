/* Cross-Post tab — Reseller Command Center
 *
 * Turns one approved master listing into ready-to-publish per-platform
 * packages for eBay, Etsy, Poshmark, Mercari, and Facebook Marketplace.
 *
 * HARD RULES (do not change):
 *  - Never log in to eBay, Poshmark, Mercari, or Facebook, and never send
 *    requests to those platforms from anywhere. Those four are manual-forever:
 *    copy/paste only, Nancy publishes in each app herself.
 *  - No secrets in the repo or Supabase. The Etsy API keystring and OAuth
 *    tokens live ONLY in this browser's localStorage.
 *  - Etsy publishing creates DRAFT listings only. Nancy reviews and activates
 *    them inside Etsy. All Etsy calls run from HER browser on HER machine.
 */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Fee math (all figures are estimates — shown as such in the UI)      */
  /* ------------------------------------------------------------------ */

  var EBAY_FEE = { pct: 0.1325, flat: 0.30, label: "~13.25% + $0.30" };
  var ETSY_FEE = { pct: 0.095, flat: 0.45, label: "~6.5% + 3% + $0.25 + $0.20 listing fee" };
  var MERCARI_FEE = { pct: 0.129, flat: 0.30, label: "~10% + 2.9% + $0.30" };

  function ebayNet(p) { return p - (p * EBAY_FEE.pct + EBAY_FEE.flat); }
  function etsyNet(p) { return p - (p * ETSY_FEE.pct + ETSY_FEE.flat); }
  function poshmarkNet(p) { return p < 15 ? p - 2.95 : p * 0.8; }
  function mercariNet(p) { return p - (p * MERCARI_FEE.pct + MERCARI_FEE.flat); }

  // Round UP to the nearest $x.99 so the suggestion never undershoots the net.
  function roundUp99(q) {
    if (!(q > 0)) return 0;
    return Math.ceil(q - 0.99 - 1e-9) + 0.99;
  }

  // Invert a net function: find the list price whose net ≈ target.
  function priceForNet(targetNet, netFn) {
    var lo = 0.01, hi = Math.max(targetNet * 3 + 5, 50), mid, i;
    for (i = 0; i < 40; i++) {
      mid = (lo + hi) / 2;
      if (netFn(mid) >= targetNet) hi = mid; else lo = mid;
    }
    return roundUp99(hi);
  }

  function money(n) { return "$" + Number(n).toFixed(2); }

  /* ------------------------------------------------------------------ */
  /* Text transforms                                                     */
  /* ------------------------------------------------------------------ */

  function smartTruncate(s, max) {
    s = String(s || "");
    if (s.length <= max) return s;
    var cut = s.slice(0, max - 1);
    var lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
    return cut.trim() + "…";
  }

  function poshmarkDescription(item) {
    var bits = [];
    bits.push("Hey loves! Selling my " + (item.title || "item") + ".");
    if (item.brand) bits.push("Brand: " + item.brand + ".");
    if (item.itemCondition) bits.push("Condition: " + item.itemCondition + ".");
    if (item.measurements) bits.push("Measurements: " + item.measurements + ".");
    if (item.listingDescription) bits.push(item.listingDescription);
    bits.push("Ships quickly — feel free to ask any questions!");
    return bits.join(" ");
  }

  var TAG_STOP = new Set(["the", "and", "with", "for", "from", "this", "that", "vintage", "nice", "great", "new", "set", "lot"]);
  function etsyTags(item) {
    var text = [item.title, item.brand, item.category].filter(Boolean).join(" ").toLowerCase();
    var words = text.split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 2 && w.length <= 20 && !TAG_STOP.has(w);
    });
    var seen = new Set(), tags = [];
    words.forEach(function (w) {
      if (!seen.has(w) && tags.length < 13) { seen.add(w); tags.push(w); }
    });
    return tags;
  }

  function etsyMaterials(item) {
    var specifics = (typeof normalizeItemSpecifics === "function")
      ? normalizeItemSpecifics(item.ebayItemSpecifics || {})
      : (item.ebayItemSpecifics || {});
    var out = [];
    Object.keys(specifics).forEach(function (k) {
      if (/material/i.test(k) && specifics[k]) {
        String(specifics[k]).split(/[,;]/).forEach(function (m) {
          m = m.trim().replace(/[^\p{L}\p{Nd}\s]/gu, "");
          if (m && out.indexOf(m) === -1) out.push(m);
        });
      }
    });
    return out;
  }

  var FASHION_RE = /shirt|dress|jacket|pants|jeans|shoe|boot|sneaker|clothing|apparel|handbag|purse|jewelry|jewellery|necklace|hat|coat|sweater|blouse|skirt|top|hoodie|fashion|scarf|belt|watch|sunglasses/i;
  function looksFashion(item) {
    return FASHION_RE.test([item.title, item.category].filter(Boolean).join(" "));
  }

  var FB_CATEGORIES = [
    [/shirt|dress|jacket|pants|jeans|shoe|boot|clothing|apparel|handbag|purse|jewelry|hat|coat|sweater|blouse|skirt|hoodie|scarf/i, "Clothing & Accessories"],
    [/chair|table|sofa|lamp|shelf|cabinet|furniture|desk|rug|mirror/i, "Furniture"],
    [/toy|game|lego|doll|puzzle/i, "Toys & Games"],
    [/book|cookbook/i, "Books"],
    [/mug|bowl|plate|vase|kitchen|cookware|pot|pan|glass|candle/i, "Home Decor"],
    [/camera|phone|laptop|computer|electronic|headphone|speaker/i, "Electronics"]
  ];
  function facebookCategory(item) {
    var text = [item.title, item.category].filter(Boolean).join(" ");
    for (var i = 0; i < FB_CATEGORIES.length; i++) {
      if (FB_CATEGORIES[i][0].test(text)) return FB_CATEGORIES[i][1];
    }
    return "Miscellaneous";
  }

  /* ------------------------------------------------------------------ */
  /* Etsy localStorage store (keystring + tokens NEVER leave the browser) */
  /* ------------------------------------------------------------------ */

  var ETSY_LS_KEY = "rcc.etsy.v1";
  var ETSY_AUTH_URL = "https://www.etsy.com/oauth/connect";
  var ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
  var ETSY_API_BASE = "https://openapi.etsy.com/v3/application";
  var ETSY_SCOPES = "listings_r listings_w shops_r";

  function etsyStore() {
    try { return JSON.parse(localStorage.getItem(ETSY_LS_KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveEtsyStore(patch) {
    var cur = etsyStore(), k;
    for (k in patch) cur[k] = patch[k];
    localStorage.setItem(ETSY_LS_KEY, JSON.stringify(cur));
  }
  function etsyRedirectUri() {
    return location.origin + location.pathname;
  }
  function etsyConnected() {
    return !!(etsyStore().access_token && etsyStore().refresh_token);
  }

  function randomToken(len) {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    var out = "", arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    for (var i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }
  function base64Url(buf) {
    var bytes = new Uint8Array(buf), s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function pkceChallenge(verifier) {
    var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64Url(digest);
  }

  async function etsyConnect() {
    var st = etsyStore();
    if (!st.keystring) { toast("Enter your Etsy API keystring first — it stays in this browser only."); return; }
    var verifier = randomToken(64);
    var state = randomToken(32);
    saveEtsyStore({ pkce_verifier: verifier, oauth_state: state });
    var params = new URLSearchParams({
      response_type: "code",
      client_id: st.keystring,
      redirect_uri: etsyRedirectUri(),
      scope: ETSY_SCOPES,
      state: state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256"
    });
    // Full-page redirect: Nancy authorizes on etsy.com in her own browser.
    location.href = ETSY_AUTH_URL + "?" + params.toString();
  }

  async function etsyHandleCallback() {
    var q = new URLSearchParams(location.search);
    var code = q.get("code"), state = q.get("state"), err = q.get("error");
    if (!code && !err) return;
    history.replaceState(null, "", location.pathname + location.hash);
    if (err) { toast("Etsy connection failed: " + (q.get("error_description") || err)); return; }
    var st = etsyStore();
    if (!state || state !== st.oauth_state) { toast("Etsy connection failed: state mismatch. Try connecting again."); return; }
    try {
      var body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: st.keystring,
        redirect_uri: etsyRedirectUri(),
        code: code,
        code_verifier: st.pkce_verifier
      });
      var res = await fetch(ETSY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      if (!res.ok) throw new Error("token exchange failed (HTTP " + res.status + ")");
      var tok = await res.json();
      // Etsy prefixes the access token with the numeric user_id: "12345678.rest"
      var userId = String(tok.access_token).split(".")[0];
      saveEtsyStore({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
        user_id: userId,
        pkce_verifier: null,
        oauth_state: null
      });
      await etsyResolveShop();
      toast("Etsy connected — one-click draft publishing is ready.");
    } catch (e) {
      toast("Etsy connection failed: " + e.message);
    }
    rerenderPackages();
  }

  async function etsyAccessToken(forceRefresh) {
    var st = etsyStore();
    if (!st.access_token) return null;
    if (!forceRefresh && Date.now() < (st.expires_at || 0) - 60000) return st.access_token;
    var body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: st.keystring,
      refresh_token: st.refresh_token
    });
    var res = await fetch(ETSY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!res.ok) throw new Error("Etsy session expired — reconnect Etsy.");
    var tok = await res.json();
    saveEtsyStore({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || st.refresh_token,
      expires_at: Date.now() + (Number(tok.expires_in) || 3600) * 1000
    });
    return tok.access_token;
  }

  async function etsyApi(path, opts) {
    opts = opts || {};
    var st = etsyStore();
    var token = await etsyAccessToken(false);
    if (!token) throw new Error("Etsy is not connected.");
    async function call(t) {
      var headers = { "x-api-key": st.keystring, "Authorization": "Bearer " + t };
      if (opts.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
      var res = await fetch(ETSY_API_BASE + path, {
        method: opts.method || "GET",
        headers: headers,
        body: opts.body || undefined
      });
      if (res.status === 401 && !opts._retried) {
        opts._retried = true;
        return call(await etsyAccessToken(true));
      }
      if (!res.ok) {
        var text = await res.text().catch(function () { return ""; });
        throw new Error("Etsy error " + res.status + ": " + text.slice(0, 220));
      }
      return res.json();
    }
    return call(token);
  }

  async function etsyResolveShop() {
    var st = etsyStore();
    if (st.shop_id) return st.shop_id;
    if (!st.user_id) throw new Error("Missing Etsy user id — reconnect Etsy.");
    var data = await etsyApi("/users/" + encodeURIComponent(st.user_id) + "/shops");
    var shop = (data.results || [])[0];
    if (!shop) throw new Error("No Etsy shop found on this account.");
    saveEtsyStore({ shop_id: shop.shop_id, shop_name: shop.shop_name });
    return shop.shop_id;
  }

  function flattenTaxonomy(nodes, prefix, out) {
    (nodes || []).forEach(function (n) {
      var path = prefix ? prefix + " > " + n.name : n.name;
      out.push({ id: n.id, path: path, name: n.name });
      if (n.children && n.children.length) flattenTaxonomy(n.children, path, out);
    });
    return out;
  }

  async function etsyTaxonomySuggestions(item) {
    var st = etsyStore();
    if (!st.keystring) return [];
    var cached = st.taxonomy_cache;
    var flat = cached && cached.length ? cached : null;
    if (!flat) {
      try {
        var headers = { "x-api-key": st.keystring };
        if (st.access_token) headers["Authorization"] = "Bearer " + st.access_token;
        var res = await fetch(ETSY_API_BASE + "/seller-taxonomy/nodes", { headers: headers });
        if (!res.ok) return [];
        var data = await res.json();
        flat = flattenTaxonomy(data.results, "", []);
        saveEtsyStore({ taxonomy_cache: flat });
      } catch (e) { return []; }
    }
    var words = [item.title, item.category, item.brand].filter(Boolean).join(" ")
      .toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !TAG_STOP.has(w); });
    return flat.map(function (n) {
      var name = (n.path || "").toLowerCase(), score = 0;
      words.forEach(function (w) { if (name.indexOf(w) !== -1) score += w.length > 4 ? 2 : 1; });
      return { id: n.id, path: n.path, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 6);
  }

  /* ------------------------------------------------------------------ */
  /* Item picker                                                         */
  /* ------------------------------------------------------------------ */

  var crossPostItemId = null;

  function eligibleItems() {
    return (typeof items !== "undefined" ? items : []).filter(function (i) {
      return ["approved", "exported", "inventory"].indexOf(i.draftStatus) !== -1 && i.status !== "Sold";
    });
  }

  function renderCrossPostPicker() {
    var searchEl = $("xpSearch"), sel = $("xpItemSelect");
    if (!searchEl || !sel) return;
    var q = (searchEl.value || "").toLowerCase();
    var list = eligibleItems().filter(function (i) {
      return !q || (i.title || "").toLowerCase().indexOf(q) !== -1;
    });
    sel.innerHTML = list.length
      ? list.map(function (i) {
          var label = (i.title || "Untitled").slice(0, 70) + " — " + money(i.listPrice || 0) +
            " — " + ((i.listingPhotoPaths || []).length) + " photos";
          return '<option value="' + escapeHtml(i.id) + '"' +
            (i.id === crossPostItemId ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
        }).join("")
      : '<option value="">No eligible items</option>';
    if (list.length && !list.some(function (i) { return i.id === crossPostItemId; })) {
      crossPostItemId = list[0].id;
      sel.value = crossPostItemId;
    }
    if (!list.length) crossPostItemId = null;
    renderCrossPostPackages();
  }

  function currentItem() {
    return eligibleItems().find(function (i) { return i.id === crossPostItemId; }) || null;
  }

  /* ------------------------------------------------------------------ */
  /* Package cards                                                       */
  /* ------------------------------------------------------------------ */

  function copyRow(label, value) {
    if (value === undefined || value === null || String(value).trim() === "") return "";
    return '<div class="xp-row" data-copy="' + escapeHtml(value) + '" title="Tap to copy">' +
      '<span class="xp-label">' + escapeHtml(label) + "</span>" +
      '<span class="xp-value">' + escapeHtml(value) + "</span>" +
      '<span class="xp-copy" aria-hidden="true">⧉</span></div>';
  }

  function priceField(platform, suggested, netFn, feeLabel) {
    var math = "";
    if (suggested > 0) {
      math = '<small class="xp-math">nets ≈ ' + money(netFn(suggested)) +
        " after " + feeLabel + " (estimates)</small>";
    }
    return '<label class="xp-price"><span>Suggested price</span>' +
      '<input type="number" min="0" step="0.01" id="xpPrice-' + platform + '" value="' +
      (suggested > 0 ? suggested.toFixed(2) : "") + '" placeholder="Enter price">' + math + "</label>";
  }

  function modePill(mode) {
    return mode === "api"
      ? '<span class="badge xp-mode-api">API-ready</span>'
      : '<span class="badge xp-mode-manual">Manual</span>';
  }

  function publishButton(item, platform) {
    var done = (item.listedMarketplaces || []).indexOf(platform) !== -1;
    return done
      ? '<span class="badge xp-published">✓ Published on ' + escapeHtml(platform) + "</span>"
      : '<button type="button" class="secondary" data-xp-publish="' + escapeHtml(platform) +
        '" data-xp-item="' + escapeHtml(item.id) + '">Mark published on ' + escapeHtml(platform) + "</button>";
  }

  function ebayCard(item) {
    var target = ebayNet(Number(item.listPrice) || 0);
    var specifics = (typeof normalizeItemSpecifics === "function")
      ? normalizeItemSpecifics(item.ebayItemSpecifics || {}) : (item.ebayItemSpecifics || {});
    var specRows = Object.keys(specifics).map(function (k) {
      return copyRow(k, specifics[k]);
    }).join("");
    return '<article class="panel xp-card">' +
      '<div class="panel-heading"><div><p class="eyebrow">Marketplace</p><h3>eBay</h3></div>' + modePill("manual") + "</div>" +
      '<p class="item-meta xp-note">You publish in Seller Hub — nothing here logs in to eBay.</p>' +
      '<div class="xp-fields">' +
      copyRow("Title (≤80)", smartTruncate(item.title, 80)) +
      copyRow("Category ID", item.ebayCategoryId) +
      copyRow("Condition ID", item.ebayConditionId) +
      specRows +
      copyRow("Description", item.listingDescription) +
      "</div>" +
      priceField("ebay", Number(item.listPrice) || 0, ebayNet, EBAY_FEE.label) +
      (target > 0 ? '<p class="xp-math">eBay net at list: ≈ ' + money(target) + " (estimates)</p>" : "") +
      '<div class="dialog-actions">' + publishButton(item, "eBay") +
      '<button type="button" class="text-button" data-jump="master-drafts">Open Master Drafts for eBay CSV export →</button></div>' +
      "</article>";
  }

  function etsyCard(item) {
    var connected = etsyConnected();
    var st = etsyStore();
    var target = ebayNet(Number(item.listPrice) || 0);
    var suggested = target > 0 ? priceForNet(target, etsyNet) : 0;
    var tags = etsyTags(item);
    var materials = etsyMaterials(item);
    var desc = item.listingDescription || "";

    var connectBlock;
    if (connected) {
      connectBlock = '<div class="xp-etsy-status"><span class="badge xp-mode-api">Connected' +
        (st.shop_name ? " — " + escapeHtml(st.shop_name) : "") + "</span> " +
        '<button type="button" class="text-button" id="etsyDisconnectBtn">Disconnect</button></div>';
    } else {
      connectBlock =
        '<div class="xp-etsy-connect">' +
        '<label>API keystring <small>(stored only in this browser — never in the repo or database)</small>' +
        '<input type="password" id="etsyKeystring" autocomplete="off" placeholder="Paste keystring from etsy.com/developers/your-apps" value="' + escapeHtml(st.keystring || "") + '"></label>' +
        '<div class="dialog-actions"><button type="button" class="secondary" id="etsySaveKeyBtn">Save keystring</button></div>' +
        '<p class="item-meta">Register this exact redirect URL in your Etsy app settings, then connect:</p>' +
        copyRow("Redirect URL", etsyRedirectUri()) +
        '<div class="dialog-actions"><button type="button" class="primary" id="etsyConnectBtn">Connect Etsy</button></div>' +
        "</div>";
    }

    return '<article class="panel xp-card">' +
      '<div class="panel-heading"><div><p class="eyebrow">Marketplace</p><h3>Etsy</h3></div>' + modePill(connected ? "api" : "manual") + "</div>" +
      '<p class="item-meta xp-note">Publish creates a <strong>draft</strong> listing only — you review and activate it inside Etsy. Runs from your browser, your IP.</p>' +
      connectBlock +
      '<div class="xp-fields">' +
      copyRow("Title (≤140)", smartTruncate(item.title, 140)) +
      copyRow("Tags (13 max)", tags.join(", ")) +
      copyRow("Materials", materials.join(", ")) +
      copyRow("Description", desc) +
      "</div>" +
      priceField("etsy", suggested, etsyNet, ETSY_FEE.label) +
      '<div class="xp-etsy-opts">' +
      '<label>Who made it<select id="etsyWhoMade"><option value="i_did">I did</option><option value="someone_else">Someone else</option><option value="collective">A collective</option></select></label>' +
      '<label>When made<select id="etsyWhenMade">' +
      ["made_to_order", "2020_2026", "2010_2019", "2007_2009", "before_2007", "2000_2006", "1990s", "1980s", "1970s", "1960s", "1950s", "1940s", "1930s", "1920s", "1910s", "1900s"]
        .map(function (v) { return '<option value="' + v + '"' + (v === "2020_2026" ? " selected" : "") + ">" + v.replace(/_/g, " ") + "</option>"; }).join("") +
      "</select></label>" +
      '<label>Etsy category (taxonomy)<select id="etsyTaxonomySelect"><option value="">Loading suggestions…</option></select>' +
      '<input id="etsyTaxonomyId" inputmode="numeric" placeholder="Taxonomy ID (required)"></label>' +
      '<label>Shipping profile ID <small>(Etsy → Shop Manager → Settings → Shipping settings; saved in this browser)</small>' +
      '<input id="etsyShippingProfile" inputmode="numeric" placeholder="Required for physical listings" value="' + escapeHtml(st.shipping_profile_id || "") + '"></label>' +
      "</div>" +
      '<p class="item-meta">Add your photos inside Etsy after the draft is created.</p>' +
      '<div class="dialog-actions">' +
      '<button type="button" class="primary" id="etsyPublishBtn"' + (connected ? "" : " disabled") + ">Publish draft to Etsy</button>" +
      publishButton(item, "Etsy") +
      "</div></article>";
  }

  function poshmarkCard(item) {
    var target = ebayNet(Number(item.listPrice) || 0);
    var suggested = target > 0 ? priceForNet(target, poshmarkNet) : 0;
    var flags = "";
    if (!item.brand) flags += '<div class="xp-flag">Brand is required on Poshmark — add it to the master listing before publishing.</div>';
    if (!looksFashion(item)) flags += '<div class="xp-flag">Poshmark is fashion-first — this may sit.</div>';
    return '<article class="panel xp-card">' +
      '<div class="panel-heading"><div><p class="eyebrow">Marketplace</p><h3>Poshmark</h3></div>' + modePill("manual") + "</div>" +
      '<p class="item-meta xp-note">You publish in the Poshmark app — nothing here logs in to Poshmark.</p>' +
      flags +
      '<div class="xp-fields">' +
      copyRow("Title", item.title) +
      copyRow("Brand", item.brand) +
      copyRow("Description", poshmarkDescription(item)) +
      "</div>" +
      priceField("poshmark", suggested, poshmarkNet, "$2.95 under $15, 20% at $15+") +
      '<div class="dialog-actions">' + publishButton(item, "Poshmark") + "</div>" +
      "</article>";
  }

  function mercariCard(item) {
    var target = ebayNet(Number(item.listPrice) || 0);
    var suggested = target > 0 ? priceForNet(target, mercariNet) : 0;
    return '<article class="panel xp-card">' +
      '<div class="panel-heading"><div><p class="eyebrow">Marketplace</p><h3>Mercari</h3></div>' + modePill("manual") + "</div>" +
      '<p class="item-meta xp-note">You publish in the Mercari app — nothing here logs in to Mercari.</p>' +
      '<div class="xp-fields">' +
      copyRow("Title", item.title) +
      copyRow("Brand", item.brand) +
      copyRow("Description", item.listingDescription) +
      "</div>" +
      priceField("mercari", suggested, mercariNet, MERCARI_FEE.label) +
      '<div class="dialog-actions">' + publishButton(item, "Mercari") + "</div>" +
      "</article>";
  }

  function facebookCard(item) {
    return '<article class="panel xp-card">' +
      '<div class="panel-heading"><div><p class="eyebrow">Marketplace</p><h3>Facebook Marketplace</h3></div>' + modePill("manual") + "</div>" +
      '<p class="item-meta xp-note">You publish in the Facebook app — nothing here logs in to Facebook.</p>' +
      '<div class="xp-fields">' +
      copyRow("Title", item.title) +
      copyRow("Category", facebookCategory(item)) +
      copyRow("Description", item.listingDescription) +
      "</div>" +
      priceField("facebook", Number(item.listPrice) || 0, function (p) { return p; }, "no fees on a local cash sale") +
      '<div class="dialog-actions">' + publishButton(item, "Facebook") + "</div>" +
      "</article>";
  }

  function renderCrossPostPackages() {
    rerenderPackages();
  }

  function rerenderPackages() {
    var wrap = $("xpPackages");
    if (!wrap) return;
    var item = currentItem();
    if (!item) {
      wrap.innerHTML = '<article class="panel"><p class="section-intro">Pick an approved item above to build its cross-post packages.</p></article>';
      var summary = $("xpItemSummary");
      if (summary) summary.textContent = "";
      return;
    }
    var summary = $("xpItemSummary");
    if (summary) {
      summary.textContent = (item.listingPhotoPaths || []).length + " photos · " +
        (item.draftStatus || "inventory") + " · " +
        ((item.listedMarketplaces || []).length ? "already on: " + item.listedMarketplaces.join(", ") : "not yet cross-posted");
    }
    wrap.innerHTML = ebayCard(item) + etsyCard(item) + poshmarkCard(item) + mercariCard(item) + facebookCard(item);
    bindPackageEvents(item);
    loadEtsyTaxonomySuggestions(item);
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  async function markPublished(itemId, platform) {
    var list = (typeof items !== "undefined" ? items : []);
    var item = list.find(function (i) { return i.id === itemId; });
    if (!item) return;
    var cur = item.listedMarketplaces || [];
    if (cur.indexOf(platform) !== -1) { toast("Already marked as published on " + platform + "."); return; }
    try {
      var saved = await saveCloudItem(Object.assign({}, item, { listedMarketplaces: cur.concat([platform]) }));
      list[list.findIndex(function (i) { return i.id === itemId; })] = saved;
      rerenderPackages();
      toast("Marked published on " + platform + ".");
    } catch (e) {
      toast("Could not save: " + e.message);
    }
  }

  async function etsyPublishDraft(item) {
    var st = etsyStore();
    var priceEl = $("xpPrice-etsy");
    var price = priceEl ? parseFloat(priceEl.value) : NaN;
    var taxonomyId = ($("etsyTaxonomyId") || {}).value || "";
    taxonomyId = String(taxonomyId).trim();
    var shippingProfile = (($("etsyShippingProfile") || {}).value || "").trim();
    if (!(price > 0)) { toast("Enter a valid Etsy price first."); return; }
    if (!taxonomyId) { toast("Pick an Etsy category (taxonomy ID) first."); return; }
    if (!shippingProfile) { toast("Enter your Etsy shipping profile ID first (Shop Manager → Settings → Shipping settings)."); return; }
    saveEtsyStore({ shipping_profile_id: shippingProfile });
    var params = new URLSearchParams();
    params.set("quantity", "1");
    params.set("title", smartTruncate(item.title, 140));
    params.set("description", item.listingDescription || item.title || "");
    params.set("price", price.toFixed(2));
    params.set("who_made", ($("etsyWhoMade") || {}).value || "i_did");
    params.set("when_made", ($("etsyWhenMade") || {}).value || "2020_2026");
    params.set("is_supply", "false");
    params.set("taxonomy_id", taxonomyId);
    params.set("shipping_profile_id", shippingProfile);
    var tags = etsyTags(item);
    if (tags.length) params.set("tags", tags.join(","));
    etsyMaterials(item).forEach(function (m) { params.append("materials", m); });
    var shopName = etsyStore().shop_name || "your Etsy shop";
    if (!window.confirm("Create this as a DRAFT listing in " + shopName + "?\n\nIt will NOT go live — you review, add photos, and activate it inside Etsy.")) return;
    try {
      var shopId = await etsyResolveShop();
      var data = await etsyApi("/shops/" + shopId + "/listings", { method: "POST", body: params.toString() });
      toast("Etsy draft created (listing " + data.listing_id + ") — review it in Etsy.");
      markPublished(item.id, "Etsy");
    } catch (e) {
      toast("Etsy publish failed: " + e.message);
    }
  }

  async function loadEtsyTaxonomySuggestions(item) {
    var sel = $("etsyTaxonomySelect"), input = $("etsyTaxonomyId");
    if (!sel || !input) return;
    var suggestions = await etsyTaxonomySuggestions(item);
    if (!suggestions.length) {
      sel.innerHTML = '<option value="">No suggestions — enter taxonomy ID manually</option>';
      return;
    }
    sel.innerHTML = suggestions.map(function (s) {
      return '<option value="' + s.id + '">' + escapeHtml(s.id + " — " + s.path) + "</option>";
    }).join("");
    input.value = suggestions[0].id;
    sel.addEventListener("change", function () { input.value = sel.value; });
  }

  function bindPackageEvents(item) {
    document.querySelectorAll("#xpPackages .xp-row[data-copy]").forEach(function (row) {
      row.addEventListener("click", function () {
        var text = row.getAttribute("data-copy");
        copyText(text).then(function () {
          row.classList.add("copied");
          setTimeout(function () { row.classList.remove("copied"); }, 900);
          toast("Copied.");
        }).catch(function () { toast("Copy failed — select the text manually."); });
      });
    });

    document.querySelectorAll("#xpPackages [data-xp-publish]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        markPublished(btn.getAttribute("data-xp-item"), btn.getAttribute("data-xp-publish"));
      });
    });

    document.querySelectorAll("#xpPackages [data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof showView === "function") showView(btn.getAttribute("data-jump"));
      });
    });

    // Recompute the "nets ≈" math line when she edits a price.
    document.querySelectorAll('#xpPackages input[id^="xpPrice-"]').forEach(function (input) {
      input.addEventListener("input", function () {
        var platform = input.id.replace("xpPrice-", "");
        var netFns = { ebay: ebayNet, etsy: etsyNet, poshmark: poshmarkNet, mercari: mercariNet, facebook: function (p) { return p; } };
        var feeLabels = { ebay: EBAY_FEE.label, etsy: ETSY_FEE.label, poshmark: "$2.95 under $15, 20% at $15+", mercari: MERCARI_FEE.label, facebook: "no fees on a local cash sale" };
        var math = input.parentElement.querySelector(".xp-math");
        var v = parseFloat(input.value);
        if (math && v > 0 && netFns[platform]) {
          math.textContent = "nets ≈ " + money(netFns[platform](v)) + " after " + feeLabels[platform] + " (estimates)";
        } else if (math) {
          math.textContent = "";
        }
      });
    });

    // Etsy connection + publish
    var saveKey = $("etsySaveKeyBtn");
    if (saveKey) saveKey.addEventListener("click", function () {
      var v = ($("etsyKeystring") || {}).value || "";
      saveEtsyStore({ keystring: v.trim() });
      toast(v.trim() ? "Keystring saved in this browser only." : "Keystring cleared.");
      rerenderPackages();
    });
    var connectBtn = $("etsyConnectBtn");
    if (connectBtn) connectBtn.addEventListener("click", etsyConnect);
    var disconnectBtn = $("etsyDisconnectBtn");
    if (disconnectBtn) disconnectBtn.addEventListener("click", function () {
      var keystring = etsyStore().keystring;
      localStorage.removeItem(ETSY_LS_KEY);
      if (keystring) saveEtsyStore({ keystring: keystring });
      toast("Etsy disconnected on this browser.");
      rerenderPackages();
    });
    var publishBtn = $("etsyPublishBtn");
    if (publishBtn) publishBtn.addEventListener("click", function () { etsyPublishDraft(item); });
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function initCrossPost() {
    var searchEl = $("xpSearch"), sel = $("xpItemSelect");
    if (searchEl) searchEl.addEventListener("input", renderCrossPostPicker);
    if (sel) sel.addEventListener("change", function () {
      crossPostItemId = sel.value || null;
      renderCrossPostPackages();
    });
    etsyHandleCallback();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCrossPost);
  } else {
    initCrossPost();
  }

  // Exposed for the showView hook in app.js
  window.renderCrossPostPicker = renderCrossPostPicker;
})();
