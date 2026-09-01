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

## Open it

Double-click `index.html`.

For the most reliable experience, run a simple local web server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Important storage note

This first version stores data in the browser using `localStorage`. Export a JSON backup regularly.

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
