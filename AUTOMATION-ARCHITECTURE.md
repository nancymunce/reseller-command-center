# Automation Architecture

## Core principle

The dashboard database is the source of truth. Marketplaces are channels connected to each inventory record.

## Marketplace strategy

### eBay
Seller-controlled workflow only:
- Prepare canonical Master Drafts and listing photos
- Generate seller-reviewed eBay CSV draft files
- Record listing IDs/URLs and sale information supplied by the seller
- Research sold comparables without account automation
- Never log in, publish, revise, end, or otherwise act on the eBay account

### Etsy
OAuth and Open API connection for listings, receipts and inventory.

### Poshmark, Depop, Mercari
Use:
- Gmail sale-notification parsing
- CSV imports when available
- One-click manual sold updates
- Approved third-party integrations where appropriate

### Facebook Marketplace
Use a fast local-sale workflow:
- Mark sold
- Enter sale amount
- Enter buyer pickup/payment notes
- Automatically delist or flag duplicates elsewhere

## Secure deployment

Frontend:
- GitHub Pages or Vercel

Backend:
- Supabase database
- Supabase Edge Functions or another serverless backend

Secrets:
- Never stored in browser JavaScript
- Never committed to GitHub
- Stored in secure server environment variables

## Suggested database tables

- items
- marketplace_listings
- sales
- expenses
- payouts
- sourcing_locations
- categories
- storage_locations
- automation_events
