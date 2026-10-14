# Verified facts and their sources

Checked against official docs on 2026-10-14. Re-check before changing a claim
on the site; free plans and limits change.

## Tools for testing locally

- **ngrok**: account and authtoken required (`ngrok config add-authtoken`).
  Free plan: one auto-assigned stable dev domain (`ngrok-free.app` or
  `.dev`), 20,000 HTTP requests a month, 4,000 a minute, 1 GB out, 3
  endpoints. The browser warning page doesn't affect API or webhook traffic.
  https://ngrok.com/docs/pricing-limits/free-plan-limits/
- **Cloudflare Quick Tunnels**: `cloudflared tunnel --url http://localhost:3000`,
  no account, new hostname every run, up to 200 in-flight requests, no
  server-sent events, testing only.
  https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
- **Tailscale Funnel**: `tailscale funnel 3000`, URL
  `https://<device>.<tailnet>.ts.net`, account needed, beta, ports 443, 8443
  and 10000 only, follows the device name. https://tailscale.com/kb/1223/funnel
- **Stripe CLI**: `stripe login`; `stripe listen --forward-to
  localhost:3000/webhook` prints its own `whsec_` that differs from the
  dashboard endpoint's and stays the same across restarts; `stripe trigger
  payment_intent.succeeded`. https://docs.stripe.com/cli/listen
- **gh webhook forward**: `gh extension install cli/gh-webhook`; repo and
  org webhooks only, not GitHub Apps; one user per repo or org at a time;
  `--secret` exists (source code, not docs).
  https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/using-the-github-cli-to-forward-webhooks-for-testing
- **smee.io**: anyone with the channel URL sees payloads; the client
  re-serializes JSON (`JSON.parse` then `JSON.stringify`) and forces
  `content-type: application/json`, which breaks HMAC checks.
  https://github.com/probot/smee-client/issues/325
- **Svix CLI**: `svix listen http://localhost:3000/webhook`, play.svix.com
  URL, no account, forwards POST. The old svix-cli repo is archived; cite
  https://github.com/svix/svix-webhooks/tree/main/svix-cli

## Providers

- **Stripe**: retries up to 3 days with exponential backoff in live mode,
  3 times over a few hours in sandboxes. `Stripe-Signature: t=…,v1=…`
  (test events also carry a fake `v0`; several `v1` during rotation).
  Signed payload `{t}.{raw body}`, HMAC-SHA256, hex. Libraries default to
  5 minutes of tolerance. HTTPS required in live mode (TLS 1.2+). Each retry
  gets a new timestamp and signature. Redirects count as failures. Order is
  not guaranteed. https://docs.stripe.com/webhooks
- **GitHub**: must respond within 10 seconds, else the delivery is failed.
  No automatic redelivery: redeliver from the UI or REST API.
  `X-Hub-Signature-256: sha256=<hex>` over the raw body (`X-Hub-Signature`
  is legacy SHA-1). Content type can be JSON or form-encoded.
  https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries
  https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- **Slack**: `X-Slack-Signature: v0=<hex>` over `v0:{X-Slack-Request-Timestamp}:{raw body}`,
  reject timestamps more than 5 minutes off. Respond with 2xx within 3
  seconds. Up to 3 retries (about immediately, 1 min, 5 min);
  `x-slack-retry-num`, `x-slack-retry-reason`, `x-slack-no-retry: 1`.
  https://docs.slack.dev/authentication/verifying-requests-from-slack
  https://docs.slack.dev/apis/events-api/
- **Shopify**: `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256 of the raw
  body with the app's client secret. 1 s connection timeout, 5 s for the
  whole request. 8 retries over 4 hours; after 8 consecutive failures,
  subscriptions created through the Admin API are deleted.
  https://shopify.dev/docs/apps/build/webhooks/subscribe/https
- **Standard Webhooks**: `webhook-id`, `webhook-timestamp`,
  `webhook-signature: v1,<base64>` (space-separated list; `v1a` is
  ed25519). Signed `{id}.{timestamp}.{body}`. Secret `whsec_` + base64; the
  reference library strips the prefix and base64-decodes. 5 minute
  tolerance. https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md

## Frameworks

- Express: `express.raw({type: 'application/json'})` gives a Buffer;
  wrong content type leaves `req.body` undefined. Alternative:
  `express.json({verify})`. Mount `express.json()` after the webhook route.
  Re-serializing a parsed body doesn't reliably reproduce the bytes.
