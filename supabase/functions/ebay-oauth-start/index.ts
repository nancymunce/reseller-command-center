// eBay OAuth start endpoint for Reseller Command Center.
// Secrets belong in Supabase Edge Function secrets, never browser code or GitHub.
// This scaffold intentionally stays inactive until the eBay Developer account is approved.

import { withSupabase } from "npm:@supabase/server";

const EBAY_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const clientId = Deno.env.get("EBAY_CLIENT_ID");
    const ruName = Deno.env.get("EBAY_RUNAME");
    const scopes = Deno.env.get("EBAY_SCOPES");

    if (!clientId || !ruName || !scopes) {
      return Response.json(
        { ready: false, message: "eBay credentials are not configured yet." },
        { status: 503 },
      );
    }

    // Bind the authorization request to the signed-in Command Center user.
    // The callback function will validate this state before accepting tokens.
    const state = crypto.randomUUID();
    const { error } = await ctx.supabase.from("ebay_oauth_states").insert({
      owner_id: ctx.userClaims!.sub,
      state,
    });
    if (error) throw error;

    const url = new URL(EBAY_AUTH_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", ruName);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);

    return Response.json({ ready: true, authorization_url: url.toString() });
  }),
};
