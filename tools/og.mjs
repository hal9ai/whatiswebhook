// Render the 1200×630 social preview cards in public/og from each page's own
// hero art, plus the PNG app icons, with headless Chrome.
//
//   cd tools && npm i --no-save playwright-core && CHROME=/path/to/chrome node og.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(process.env.PLAYWRIGHT_FROM || import.meta.url);
const { chromium } = require("playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARDS = [
  { out: "home", page: "/", art: ".hero-fig svg", tag: "CH. 01 · Webhooks", title: "What is a webhook?", sub: "An app, calling you back: how webhooks work, what one looks like, and where the URL has to live." },
  { out: "local", page: "/test-webhook-locally.html", art: ".hero-fig svg", tag: "CH. 02 · Test locally", title: "Test a webhook locally", sub: "Stripe can't reach localhost. Provider CLIs, tunnels and replays, compared." },
  { out: "troubleshoot", page: "/webhook-not-working.html", art: ".hero-fig svg", tag: "CH. 03 · Troubleshoot", title: "Webhook not working?", sub: "Every failure point of a delivery, each provider's log, and the fix." },
  { out: "signatures", page: "/verify-webhook-signatures.html", art: ".hero-fig svg", tag: "CH. 04 · Signatures", title: "Verify webhook signatures", sub: "HMAC explained, with a live playground and code for every provider." },
  { out: "deploy", page: "/deploy-webhook-receiver.html", art: ".hero-fig svg", tag: "CH. 05 · Deploy", title: "Deploy a webhook receiver", sub: "A tunnel lives as long as your laptop is awake. Give your webhook a real home." },
  { out: "tester", page: "/", art: "#anatomy .code", tag: "TOOL · Free, no signup", title: "Webhook tester", sub: "Get a URL, paste it into Stripe or GitHub, and watch every request arrive." },
];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: "dark" });
const page = await ctx.newPage();
fs.mkdirSync(path.join(root, "og"), { recursive: true });
for (const c of CARDS) {
  await page.goto(base + c.page, { waitUntil: "load" });
  const defs = await page.evaluate(() => document.querySelector('svg[width="0"]')?.outerHTML ?? "");
  const art = await page.evaluate((s) => document.querySelector(s).outerHTML, c.art);
  const logo = await page.evaluate(() => document.querySelector(".masthead .logo").outerHTML);
  const [tag, kicker] = c.tag.split(" · ");
  await page.setContent(`<!doctype html><html lang="en" class="js" data-theme="dark"><head><meta charset="utf-8">
    <link rel="stylesheet" href="${base}/styles.css"><link rel="stylesheet" href="${base}/webhook.css">
    <style>
      body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
      .og { position: relative; display: grid; grid-template-columns: 540px 1fr; gap: 28px; align-items: center; height: 630px; padding: 0 56px 0 64px; box-sizing: border-box; }
      .og h1 { font-size: 64px; margin: 22px 0 18px; }
      .og .lede { font-size: 24px; margin: 0; }
      .og .foot { position: absolute; left: 64px; bottom: 44px; display: flex; align-items: center; gap: 16px; font: 500 15px/1 var(--font-mono); letter-spacing: .12em; color: var(--ink-3); text-transform: uppercase; }
      .og .foot .logo { font: 600 22px/1 var(--font-display); letter-spacing: -.02em; text-transform: none; } .og .foot .logo svg { width: 36px; height: 36px; }
      .og .art { display: grid; place-items: center; max-height: 560px; }
      .og .art > svg { width: 100%; max-height: 540px; }
      .og .art > .code { width: 100%; font-size: 14px; } .og .art .copy { display: none; }
      .og::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: linear-gradient(90deg, var(--stroke), var(--signal)); }
    </style></head><body>${defs}
    <div class="og"><div><p class="kicker"><span class="tag">${tag}</span>${kicker}</p><h1>${c.title}</h1><p class="lede">${c.sub}</p></div><div class="art">${art}</div>
    <div class="foot">${logo}<span>A field guide to webhooks</span></div></div></body></html>`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(root, "og", `${c.out}.png`) });
  console.log("og/" + c.out + ".png");
}
// App icons from the favicon.
const svg = fs.readFileSync(path.join(root, "favicon.svg"), "utf8");
for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#ffd23f">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: path.join(root, name) });
  await p.close();
  console.log(name);
}
await browser.close();
server.close();
