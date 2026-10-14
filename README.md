# whatiswebhook.com

A visual field guide to webhooks: what they are, how to test them on your laptop, why deliveries fail, how to verify signatures, and how to deploy a receiver. It comes with a live webhook tester.

The companion to [whatislocalhost.com](https://whatislocalhost.com), in the same design.

## Pages

| Page | Topic |
| --- | --- |
| [`index.html`](public/index.html) | **What is a webhook?** Webhooks vs polling, one payment step by step, a delivery on the wire, a polling cost calculator |
| [`test-webhook-locally.html`](public/test-webhook-locally.html) | **Test a webhook locally.** Provider CLIs, tunnels, capture and replay, compared; the traps |
| [`webhook-not-working.html`](public/webhook-not-working.html) | **Webhook not working?** Delivery logs, status codes, timeouts, retries, and fixes |
| [`verify-webhook-signatures.html`](public/verify-webhook-signatures.html) | **Verify signatures.** HMAC with an interactive playground, each provider's scheme, code in Node and Python |
| [`deploy-webhook-receiver.html`](public/deploy-webhook-receiver.html) | **Deploy a receiver.** What production needs, a complete receiver with a Dockerfile, cold starts |
| [`webhook-tester.html`](public/webhook-tester.html) | **Webhook tester.** A public URL that records requests; headers, exact bytes, signature checks, replay |

[`llms.txt`](public/llms.txt) has a plain-text summary of the key facts for AI agents. [`docs/sources.md`](docs/sources.md) lists every fact the pages state, with the official source it was checked against.

## Layout

No framework and no build step.

- `public/`: the site. One HTML file per page, `styles.css` (the shared blueprint design system from whatislocalhost.com, unchanged), `webhook.css` (this site's additions), `script.js` (shared interactions), and one script per interactive page: `tester.js`, `signatures.js`, `home.js`.
- `src/server.js`: a dependency-free Node server. It serves `public/` and runs the tester's API.
- `src/bins.js`: the tester's in-memory store.
- `test/`: `npm test`.

## The webhook tester

`POST /api/bins` returns a URL under `/in/<id>`. Every request sent there, any method and any path below it, is recorded: method, path, query, headers in their original order and case, and the exact body bytes (up to 256 KiB). `GET /api/bins/<id>/stream` pushes each one as a server-sent event. `PATCH /api/bins/<id>` sets the status and delay `/in/` answers with, to watch a provider retry. Slack's `url_verification` challenge is answered automatically.

Nothing is written to disk. A bin's requests are kept for an hour after its last use (24 hours at most), up to its 50 most recent, and it takes at most 120 a minute. The URL outlives that: a well-formed ID the server has forgotten, after an hour or a restart, comes back as an empty bin, and the page keeps its own copy of the last 50 requests in the browser. Signature checks run in the browser; secrets never reach the server.

Because bins live in memory, run a single instance. The app can sleep when idle (we use 5 minutes): URLs keep working after a wake-up, and the page still shows what it already received. Requests that arrive while no page is open and the app then sleeps are lost; the first request after a sleep waits for the app to start.

## Running locally

```sh
npm start            # http://localhost:8080
npm test
```

Or the way production runs it:

```sh
docker build -t whatiswebhook .
docker run -p 8080:8080 whatiswebhook
```

If you change `styles.css`, `webhook.css` or a script, bump the `?v=` version in the HTML so cached copies refresh. After changing a page's hero figure, regenerate the social cards and icons with `tools/og.mjs`.

## Deploying

The site is deployed on [Cloudish](https://cloudish.ai). From the repo root:

```sh
scripts/deploy.sh   # needs CLOUDISH_API_KEY; see the script for the one-call key and the idle setting
```

## License

Code under the [MIT License](LICENSE). Text and diagrams under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Fonts under the SIL Open Font License ([`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt)).

## Credits

- **[Cloudish](https://cloudish.ai)** hosts the site and the tester.
- **[Hal9](https://hal9.com)** built this project.
