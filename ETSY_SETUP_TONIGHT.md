# Etsy API Setup — Tonight's Checklist

Goal: connect the Reseller Command Center's Cross-Post tab to Nancy's Etsy shop
("a flourishing lifestyle") so it can create draft listings via Etsy's official API.

## Part A — Push the Cross-Post tab (GitHub auth needed)
1. Decide the auth route: Nancy pushes from her new MacBook (clone + push there),
   or she provides a GitHub personal access token via the secure vault.
2. Push branch `cross-post-tab` (now includes the eBay 80-char title fix, merged Oct 2).
3. Deploy: merge to main (or set Pages to the branch) so the live dashboard gets the tab.

## Part B — Etsy app + OAuth (in Nancy's browser)
1. Go to etsy.com/developers/your-apps and create a new app.
2. Set the callback URL to: https://nancymunce.github.io/reseller-command-center/index.html
3. Copy the app's keystring (API key).
4. In the dashboard's Cross-Post tab, paste the keystring and click Connect —
   approve the OAuth prompt on etsy.com. Tokens stay in browser localStorage only.
5. In Etsy: create a shipping profile for physical items, copy its numeric profile ID,
   and enter it in the Cross-Post tab settings.

## Part C — Test
1. Pick one draft in the Cross-Post tab and create an Etsy draft listing.
2. Verify it appears as a DRAFT in the Etsy shop (not active).
3. Nancy reviews, adds photos, and activates manually in Etsy.

Notes:
- The integration only ever creates drafts; nothing publishes without Nancy's review.
- No tokens or keys go into GitHub, Supabase, or chat — browser localStorage only.
- eBay stays manual (API denied); this automation win is Etsy-only.
