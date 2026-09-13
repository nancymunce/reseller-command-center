# Reseller Command Center

A local-first reseller inventory and profit dashboard built for Nancy.

## What works now

- Add and edit inventory
- Track purchase cost, source, storage location and marketplaces
- Mark items listed or sold
- Record sale price, shipping collected, fees, label cost and other expenses
- Calculate net profit, ROI and days to sell
- Dashboard metrics and marketplace profit summaries
- Filters and search
- JSON backup and CSV export/import
- Browser-based storage with no login required
- Browser-assisted Facebook Marketplace sourcing
- eBay sold-listing research links
- Net-profit and ROI evaluation with adjustable expense estimates
- Sourcing recommendations based on a 100% net-ROI target

## Open it

Double-click `index.html`.

For the most reliable experience, run a simple local web server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Important storage note

This first version stores data in the browser using `localStorage`. Export a JSON backup regularly.

## Marketplace Scout extension

The companion Chrome extension is in `marketplace-scout-extension`. It scans only the Facebook Marketplace listing cards visible in the browser tab when the user presses the scan button. It does not request or store Facebook or eBay credentials, contact sellers, make offers, buy items, or run unattended.

### Install on Chrome for Mac

1. Download or clone this repository and keep the folder in a permanent location.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `marketplace-scout-extension` folder.
6. Pin **Marketplace Scout** to the Chrome toolbar.

### Scan workflow

1. Open Facebook Marketplace and set the location to ZIP code **34221** with a **50-mile** radius.
2. Run searches or browse categories and scroll to load the desired results.
3. Select the Marketplace Scout extension and choose **Scan Visible Listings**.
4. Choose **Send to Dashboard**.
5. In the dashboard's **Sourcing Scout** tab, open each listing's research form.
6. Use **Research eBay Sold Items**, enter a defensible expected sale price and costs, rate the evidence confidence, and save.

The scanner collects the listing title, asking price, visible location, thumbnail URL, Facebook link, and scan time. Facebook can change its page structure; if a future change prevents collection, update `facebook-scanner.js` rather than increasing automation or requesting user credentials.

### Sourcing defaults

- Home ZIP code: 34221
- Search radius: 50 miles
- Maximum purchase price: none
- Minimum dollar profit: none
- Target: at least 100% net ROI
- Priorities: glassware and home décor, electronics and small appliances, vintage and collectibles, locally resold furniture, and other easily shippable items

Estimated net profit is calculated as:

```text
expected sale price + shipping charged to buyer
- Facebook asking price
- estimated eBay fee
- shipping label cost
- packing supplies
- repair/cleaning cost
- allocated travel cost
```

Net ROI is estimated net profit divided by the Facebook asking price. The default fee estimate is 13.6% of the buyer's item-and-shipping total plus $0.40, and can be changed for each opportunity.

## Recommended next build

1. Supabase database for login, backup and multi-device access
2. Secure server-side functions
3. eBay OAuth connection
4. eBay order, fees, shipping and payout synchronization
5. Gmail sale-notification parsing for marketplaces without public seller APIs
6. Photo uploads, SKU labels and barcode scanning
7. GitHub Pages deployment

## Profit formula

Net profit = sale price + shipping collected - purchase cost - marketplace fees - shipping cost - other expenses
