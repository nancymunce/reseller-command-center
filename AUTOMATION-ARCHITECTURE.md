# Automation Architecture

## Core principle

The dashboard database is the source of truth. Marketplaces are channels connected to each inventory record.

## Marketplace strategy

### eBay
Secure OAuth integration using:
- Sell Fulfillment API for orders
- Sell Finances API for fees, transactions and payouts
- Inventory API for listings and quantities

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
