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

## Added for Chapter 03

- **Stripe delivery log**: Workbench → Webhooks → select endpoint → **Event
  deliveries** tab; events are Delivered, Pending or Failed; click one for
  the HTTP status of each attempt and the next retry time. Manual **Resend**
  in the Dashboard up to 15 days after the event; `stripe events resend
  <event_id> --webhook-endpoint=<endpoint_id>` up to 30 days. A manual resend
  doesn't cancel automatic retries; answer 200 to stop them.
  https://docs.stripe.com/webhooks
  https://docs.stripe.com/workbench/event-destinations
- **Stripe status table**: (Unable to connect) ERR, (302) ERR or other 3xx
  (redirects are failures), (400) ERR or other 4xx (401, 403, 405 called
  access restrictions; 404 doesn't exist), (500) ERR or other 5xx, (TLS
  error) ERR (certificate or intermediate; TLS 1.2+; SSL Labs test), (Timed
  out) ERR. No timeout number published: "quickly return a 2xx before any
  complex logic". Stripe supports TLS 1.2 and 1.3 only. CSRF: exempt the
  route (Rails `protect_from_forgery except: :webhook`). Sometimes two
  separate Event objects for one change: dedupe on `data.object` id + type.
  `created` is in seconds, don't use it to order.
  https://docs.stripe.com/events/manage-webhook-endpoints
- **Stripe disabled endpoints**: you can disable a destination; Stripe won't
  resend events generated while it's disabled, and retries of an event stop
  if the destination is disabled or deleted. Recover with List Events
  (`delivery_success=false`, last 30 days). **No official docs found for an
  automatic-disable rule or its email; left out of the page.**
  https://docs.stripe.com/workbench/event-destinations
  https://docs.stripe.com/events/manage-webhook-endpoints#process-undelivered-events
- **Stripe sandboxes**: isolated from each other and from live data; test and
  live secrets for the same endpoint differ.
  https://docs.stripe.com/sandboxes https://docs.stripe.com/webhooks
- **Stripe webhook IPs**: listed at https://docs.stripe.com/ips#webhook-notifications,
  also https://stripe.com/files/ips/ips_webhooks.txt and `.json`; seven days'
  notice of changes on the API announce mailing list.
- **GitHub Recent Deliveries**: Settings → Webhooks → click the URL → Recent
  Deliveries → click the GUID → Redeliver. Past 3 days only. Shows request
  headers, payload, time and response. Only repo admins / org owners can
  redeliver. Section absent if the webhook isn't active.
  https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/viewing-webhook-deliveries
  https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks
- **GitHub REST**: `GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries`,
  `POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts`.
  https://docs.github.com/en/rest/repos/webhooks
- **GitHub troubleshooting**: `localhost` and `127.0.0.1` not allowed;
  "failed to connect to host" (DNS, check with nslookup, IP allowlist),
  "failed to connect to network" (refused), "timed out" (10 s), "Peer
  certificate cannot be authenticated with given CA certificates"
  (self-signed or incomplete chain; SSL Labs or `openssl s_client -connect
  HOST:PORT`, look for `verify error`), "invalid HTTP response" (any 4xx or
  5xx), out-of-order deliveries, deliveries can take a few minutes; no
  secret means no signature header.
  https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks
- **GitHub best practices**: a redelivery keeps the same `X-GitHub-Delivery`;
  SSL verification on by default, leave it on; IPs from `GET /meta`, refresh
  periodically. https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
  The `hooks` key of https://api.github.com/meta lists the webhook ranges
  (https://docs.github.com/en/rest/meta/meta).
- **GitHub payloads**: capped at 25 MB; larger payloads aren't delivered.
  https://docs.github.com/en/webhooks/webhook-events-and-payloads
  Form-encoded content type sends the JSON as a `payload` form parameter.
  https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks
- **Shopify logs**: Dev Dashboard → Apps → your app → **Logs** (past 7 days,
  can lag several minutes, samples successes at high volume); **Overview**
  Operations card charts failed delivery rate, deliveries, p90 response
  time. No documented manual redelivery. Any non-2xx including 3xx is an
  error. Dedupe with `X-Shopify-Webhook-Id`; `X-Shopify-Event-Id` is shared
  by deliveries from one merchant action. Warning emails go to the app's
  emergency developer email before Admin-API subscriptions are deleted.
  https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks
  https://shopify.dev/docs/apps/build/webhooks/subscribe/https
- **Slack**: retry reasons `http_timeout`, `too_many_redirects` (more than 2),
  `connection_failed`, `ssl_error`, `http_error`, `unknown_error`; follows up
  to two 301/302 redirects. Subscriptions temporarily disabled if more than
  95% of attempts fail within 60 minutes (apps under 1,000 events an hour
  exempt); app owner emailed; re-enable in app management. `event_id` in the
  envelope is globally unique. No delivery log documented. Request URL is set
  under Event Subscriptions, verified with `url_verification`, case-sensitive,
  Retry button if verification times out.
  https://docs.slack.dev/apis/events-api/
  https://docs.slack.dev/apis/events-api/using-http-request-urls
- **Body limits**: Express `express.json()` and `express.raw()` default
  `limit` "100kb" (https://expressjs.com/en/5x/api/express/); nginx
  `client_max_body_size` default 1m, returns 413
  (https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size).

## Added for Chapter 04

Checked on 2026-10-14 for /verify-webhook-signatures.html.

- **Stripe, manual verification**: split `Stripe-Signature` on `,` then `=`;
  keep `t` and every `v1`, ignore other schemes (test events add a fake
  `v0`). Signed payload is `{t}.{body}`, HMAC-SHA256 with the endpoint
  secret, constant-time compare against each `v1`. Rolling a secret can keep
  the old one active up to 24 h; Stripe sends one signature per active
  secret. Don't use tolerance 0: it disables the recency check. Use NTP.
  Each endpoint has its own secret, and test and live differ. HTTPS is
  required in live mode; TLS 1.2 and 1.3 only.
  https://docs.stripe.com/webhooks
- **Stripe, signature errors**: most common cause is the wrong secret (CLI
  vs Dashboard); frameworks that reorder keys, strip whitespace or change
  encoding break it; mount `express.json()` after the webhook route; API
  Gateway needs a body mapping template for the raw body. Error text: "No
  signatures found matching the expected signature for payload".
  https://docs.stripe.com/events/manage-webhook-endpoints#signature-errors
- **stripe-node**: `constructEvent(payload, header, secret, tolerance?)`,
  default tolerance 300 s, payload must be a string or Uint8Array/Buffer
  ("Payload was provided as a parsed JavaScript object instead"), adds a note
  when the secret contains whitespace, and tells forwarding tools to keep
  "the exact request body, including JSON formatting and new line style".
  The whole `whsec_…` string is the HMAC key.
  https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts
- **stripe-python**: `stripe.Webhook.construct_event(payload, sig_header,
  secret, tolerance=300)`; raises `SignatureVerificationError`, exported as
  `stripe.SignatureVerificationError` and via `stripe.error`; key is
  `secret.encode("utf-8")`.
  https://github.com/stripe/stripe-python/blob/master/stripe/_webhook.py
- **GitHub**: `X-Hub-Signature-256: sha256=<hex>` of the body with the
  webhook secret; header absent without a secret; handle payload as UTF-8;
  never use `==`. Test values: secret `It's a Secret to Everybody`, payload
  `Hello, World!` → `757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17`
  (reproduced with Node and openssl). Proxies and load balancers must not
  modify payload or headers.
  https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  Payloads are capped at 25 MB.
  https://docs.github.com/en/webhooks/webhook-events-and-payloads
  Use HTTPS, leave SSL verification on; `X-GitHub-Delivery` against replays
  (same value on redelivery).
  https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- **Slack**: signing secret is in the app admin panel under Basic Info; base
  string `v0:{timestamp}:{raw body}`; hex digest prefixed `v0=`; reject
  timestamps more than five minutes from local time; use an HMAC compare
  function. Doc example (secret `8f742231b10e8888abcd99yyyzzz85a5`, ts
  `1531420618`) gives `v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503`
  (reproduced with Node).
  https://docs.slack.dev/authentication/verifying-requests-from-slack
- **Shopify**: page moved to verify-deliveries. Base64 HMAC-SHA256 of the
  raw body with the app's client secret; after rotating the client secret
  it can take up to an hour before the new one is used; dedupe with
  `X-Shopify-Webhook-Id`. `X-Shopify-Triggered-At` exists but the HMAC
  covers the body only.
  https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
  https://shopify.dev/docs/apps/build/webhooks/delivery-structure
- **Standard Webhooks**: signed content `msg_id.timestamp.payload`; header is
  a space-delimited list for zero-downtime rotation; symmetric secrets are
  24 to 64 random bytes, base64, prefixed `whsec_`; constant-time compare.
  https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
  Reference libraries (`standardwebhooks` on npm and PyPI) strip `whsec_`,
  base64-decode, reject timestamps more than 5 min too old or too new. Test
  vector: secret `MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, id
  `msg_p5jXN8AQM9LWM0D4loKWxJek`, ts `1614265330`, body `{"test": 2432232314}`
  → `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=`.
  https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries
- **Node `crypto.timingSafeEqual(a, b)`**: constant time; throws if the byte
  lengths differ (`ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`).
  https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b
- **Python `hmac`**: `digestmod` is required (3.8+); `compare_digest` takes
  two bytes-like objects or two ASCII-only `str` (non-ASCII raises
  `TypeError`); docs warn against `==` on `hexdigest()`.
  https://docs.python.org/3/library/hmac.html
- **Express `express.raw()`**: body as a Buffer; `req.body` is `undefined`
  when there's no body, the type doesn't match, or on error (Express 5);
  default type `application/octet-stream`, default limit `100kb`.
  https://expressjs.com/en/5x/api/express/
- **Flask `request.get_data()`**: returns the buffered body as bytes; returns
  nothing if form data was already parsed.
  https://flask.palletsprojects.com/en/stable/api/
- **curl `-d @file`**: strips carriage returns, newlines and null bytes from
  the file; use `--data-binary` for exact bytes.
  https://curl.se/docs/manpage.html#-d
- **JSON round trips** (run locally, Node 22 and Python 3): raw
  `{"b":1, "2":true, "url":"https:\/\/x.io", "n":1.0, "name":"Zoë"}` →
  Node `{"2":true,"b":1,"url":"https://x.io","n":1,"name":"Zoë"}`, Python
  `{"b": 1, "2": true, "url": "https://x.io", "n": 1.0, "name": "Zo\u00eb"}`.
