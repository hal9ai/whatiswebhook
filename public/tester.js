/* whatiswebhook.com — the webhook tester. No dependencies. Everything that
   comes from a request is rendered with textContent, never as HTML. */
(() => {
  "use strict";
  const root = document.querySelector("[data-tester]");
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const urlField = $("#wt-url");
  const statusText = $("[data-status]");
  const dot = $(".wt-dot");
  const items = $("[data-items]");
  const empty = $("[data-empty]");
  const count = $("[data-count]");
  const detail = $("[data-detail]");

  let bin = null;
  let entries = [];
  let selected = null;
  let source = null;
  let pollTimer = null;
  let failures = 0;

  const STORE_KEY = "wt-bin";
  const enc = new TextEncoder();

  /* ---------- API ---------- */
  async function api(path, opts = {}) {
    const res = await fetch(path, { cache: "no-store", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(body.error || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return body;
  }

  async function load() {
    let id = null;
    try { id = localStorage.getItem(STORE_KEY); } catch (e) { /* private mode */ }
    if (id) {
      try { return useBin(await api(`/api/bins/${id}`)); } catch (e) { if (e.status !== 404) return offline(e); }
    }
    return fresh();
  }

  async function fresh() {
    try { useBin(await api("/api/bins", { method: "POST" })); } catch (e) { offline(e); }
  }

  function offline(e) {
    setState("down", e.status === 429 ? "Too many new URLs from your network. Try again in a while." : "Can't reach the tester right now. Retrying…");
    if (e.status !== 429) setTimeout(load, 5000);
  }

  function useBin(b) {
    bin = b;
    try { localStorage.setItem(STORE_KEY, b.id); } catch (e) { /* private mode */ }
    urlField.value = b.url;
    $("[data-respond-status]").value = String(b.respond.status);
    $("[data-respond-delay]").value = String(b.respond.delayMs);
    entries = b.requests.slice();
    selected = entries[0] ? entries[0].id : null;
    renderSamples();
    renderList();
    renderDetail();
    connect();
  }

  /* ---------- Live updates ---------- */
  function connect() {
    if (source) source.close();
    clearTimeout(pollTimer);
    if (!("EventSource" in window)) return poll();
    source = new EventSource(`/api/bins/${bin.id}/stream`);
    source.addEventListener("open", () => { failures = 0; setState("live"); });
    source.addEventListener("request", (ev) => { add(JSON.parse(ev.data)); });
    source.addEventListener("expired", () => { source.close(); expired(); });
    source.addEventListener("error", () => {
      failures += 1;
      setState("connecting");
      if (failures >= 3) { source.close(); poll(); }
    });
  }

  async function poll() {
    try {
      const b = await api(`/api/bins/${bin.id}`);
      bin.expiresAt = b.expiresAt;
      const known = new Set(entries.map((e) => e.id));
      b.requests.slice().reverse().forEach((r) => { if (!known.has(r.id)) add(r); });
      setState("live", "polling");
    } catch (e) {
      if (e.status === 404) return expired();
      setState("connecting");
    }
    pollTimer = setTimeout(poll, 4000);
  }

  function expired() {
    setState("down", "This URL expired. Get a new one to keep testing.");
    urlField.classList.add("is-expired");
  }

  function add(entry) {
    if (entries.some((e) => e.id === entry.id)) return;
    entries.unshift(entry);
    if (entries.length > 50) entries.pop();
    const follow = !selected || selected === (entries[1] && entries[1].id);
    if (follow) selected = entry.id;
    renderList(entry.id);
    if (follow) renderDetail();
  }

  function setState(state, note) {
    dot.dataset.state = state;
    if (state === "live") {
      const mins = bin ? Math.max(0, Math.round((Date.parse(bin.expiresAt) - Date.now()) / 60000)) : 0;
      statusText.textContent = `Listening${note ? ` (${note})` : ""}. This URL lasts an hour after its last use.`;
      statusText.title = `Expires in about ${mins} min unless used`;
    } else if (state === "connecting") {
      statusText.textContent = "Reconnecting…";
    } else {
      statusText.textContent = note || "Offline";
    }
  }

  /* ---------- List ---------- */
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`);

  function renderList(fresh) {
    items.textContent = "";
    count.textContent = String(entries.length);
    empty.hidden = entries.length > 0;
    for (const e of entries) {
      const li = el("li");
      const b = el("button", "wt-item");
      b.type = "button";
      b.setAttribute("aria-pressed", String(e.id === selected));
      if (e.id === fresh) b.classList.add("is-new");
      const m = el("span", `wt-method m-${e.method.toLowerCase()}`, e.method);
      const p = el("span", "wt-item-path", e.path + (e.query ? `?${e.query}` : ""));
      const meta = el("span", "wt-item-meta", `${fmtTime(e.receivedAt)} · ${fmtSize(e.size)}`);
      const prov = detectProvider(e);
      if (prov) meta.textContent += ` · ${PROVIDERS[prov].label}`;
      b.append(m, p, meta);
      b.addEventListener("click", () => { selected = e.id; renderList(); renderDetail(); });
      li.append(b);
      items.append(li);
    }
  }

  /* ---------- Detail ---------- */
  const header = (e, name) => { const n = name.toLowerCase(); const h = e.headers.find(([k]) => k.toLowerCase() === n); return h ? h[1] : null; };
  const bodyBytes = (e) => (e.body != null ? enc.encode(e.body) : Uint8Array.from(atob(e.bodyBase64 || ""), (c) => c.charCodeAt(0)));

  function renderDetail() {
    const e = entries.find((x) => x.id === selected);
    detail.hidden = !e;
    if (!e) return;
    $("[data-d-method]").textContent = e.method;
    $("[data-d-method]").className = `wt-method m-${e.method.toLowerCase()}`;
    $("[data-d-path]").textContent = e.path + (e.query ? `?${e.query}` : "");
    $("[data-d-meta]").textContent = `${new Date(e.receivedAt).toLocaleString()} · ${fmtSize(e.size)} · from ${e.ip || "unknown"} · answered ${e.response.status}${e.response.delayMs ? ` after ${e.response.delayMs / 1000} s` : ""}`;
    renderBody(e);
    renderHeaders(e);
    renderReplay(e);
    const prov = detectProvider(e);
    if (prov) $("[data-sig-provider]").value = prov;
    $("[data-sig-out]").textContent = "";
  }

  function renderBody(e) {
    const code = $("[data-d-body]");
    const label = $("[data-d-body-label]");
    const form = $("[data-d-form]");
    code.textContent = "";
    form.hidden = true;
    const type = (e.contentType || "").toLowerCase();
    if (e.size === 0) { label.textContent = "Body · empty"; code.append(el("span", "c", "(no body)")); return; }
    if (e.body == null) {
      label.textContent = `Body · binary · ${fmtSize(e.size)}`;
      code.textContent = hexdump(bodyBytes(e).slice(0, 2048));
      return;
    }
    let parsed;
    try { parsed = JSON.parse(e.body); } catch (err) { parsed = undefined; }
    if (parsed !== undefined && typeof parsed === "object") {
      label.textContent = `Body · JSON${e.truncated ? " · cut at 256 KiB" : ""}`;
      highlightJson(code, JSON.stringify(parsed, null, 2));
    } else {
      label.textContent = `Body · ${type.split(";")[0] || "text"}${e.truncated ? " · cut at 256 KiB" : ""}`;
      code.textContent = e.body;
    }
    if (type.startsWith("application/x-www-form-urlencoded")) {
      const tbody = $("tbody", form);
      tbody.textContent = "";
      for (const [k, v] of new URLSearchParams(e.body)) {
        const tr = el("tr");
        tr.append(el("th", null, k), el("td", "mono", v));
        tr.firstChild.scope = "row";
        tbody.append(tr);
      }
      form.hidden = false;
    }
  }

  function highlightJson(code, text) {
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) code.append(text.slice(last, m.index));
      if (m[1]) {
        code.append(el("span", m[2] ? "k" : "s", m[1]));
        if (m[2]) code.append(m[2]);
      } else {
        code.append(el("span", "n", m[0]));
      }
      last = m.index + m[0].length;
    }
    code.append(text.slice(last));
  }

  function hexdump(bytes) {
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const row = bytes.slice(i, i + 16);
      const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ");
      const asc = Array.from(row, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      lines.push(`${i.toString(16).padStart(6, "0")}  ${hex.padEnd(47)}  ${asc}`);
    }
    return lines.join("\n");
  }

  function renderHeaders(e) {
    const tbody = $("[data-d-headers]");
    tbody.textContent = "";
    for (const [k, v, transit] of e.headers) {
      const tr = el("tr", transit ? "is-transit" : null);
      const th = el("th", "mono", k);
      th.scope = "row";
      tr.append(th, el("td", "mono", v));
      tbody.append(tr);
    }
  }

  /* ---------- Replay ---------- */
  const SKIP = new Set(["host", "content-length", "connection", "transfer-encoding", "accept-encoding", "keep-alive", "upgrade"]);
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

  function renderReplay(e) {
    const url = `http://localhost:3000${e.path}${e.query ? `?${e.query}` : ""}`;
    const parts = [];
    for (const [k, v, transit] of e.headers) if (!transit && !SKIP.has(k.toLowerCase()) && !k.toLowerCase().startsWith("sec-")) parts.push(`  -H ${q(`${k}: ${v}`)}`);
    let cmd;
    if (e.size === 0) {
      cmd = `curl -X ${e.method} ${q(url)}${parts.length ? " \\\n" + parts.join(" \\\n") : ""}`;
    } else {
      const feed = e.body != null ? `printf '%s' ${q(e.body)}` : `printf '%s' ${q(e.bodyBase64)} | base64 -d`;
      cmd = `${feed} | \\\ncurl -X ${e.method} ${q(url)} \\\n${parts.join(" \\\n")}${parts.length ? " \\\n" : ""}  --data-binary @-`;
    }
    $("[data-d-replay]").textContent = cmd;
  }

  /* ---------- Signatures ---------- */
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  async function hmac(keyBytes, data) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", key, data);
  }
  const age = (ts) => Math.round(Date.now() / 1000 - Number(ts));
  const ageNote = (ts, entry) => {
    const sent = Number(ts);
    if (!Number.isFinite(sent)) return null;
    const atCapture = Math.round(Date.parse(entry.receivedAt) / 1000 - sent);
    return `Signed ${Math.abs(atCapture) < 2 ? "right before" : `${atCapture} s before`} it arrived (${age(ts)} s ago now).`;
  };

  const PROVIDERS = {
    stripe: {
      label: "Stripe",
      header: "Stripe-Signature",
      async check(e, secret) {
        const h = header(e, "stripe-signature");
        if (!h) return { ok: false, why: "No Stripe-Signature header on this request." };
        const pairs = h.split(",").map((p) => p.split("="));
        const t = (pairs.find(([k]) => k === "t") || [])[1];
        const sigs = pairs.filter(([k]) => k === "v1").map(([, v]) => v);
        if (!t || !sigs.length) return { ok: false, why: "The header has no t= timestamp or v1= signature." };
        const mac = hex(await hmac(enc.encode(secret), concat(enc.encode(`${t}.`), bodyBytes(e))));
        return { ok: sigs.includes(mac), expected: `v1=${mac}`, got: sigs.map((s) => `v1=${s}`).join(", "), signed: "{t}.{raw body}, HMAC-SHA256 with the endpoint secret, hex", note: ageNote(t, e) };
      },
    },
    github: {
      label: "GitHub",
      header: "X-Hub-Signature-256",
      async check(e, secret) {
        const h = header(e, "x-hub-signature-256");
        if (!h) return { ok: false, why: "No X-Hub-Signature-256 header. GitHub only signs deliveries when the webhook has a secret." };
        const mac = `sha256=${hex(await hmac(enc.encode(secret), bodyBytes(e)))}`;
        return { ok: h === mac, expected: mac, got: h, signed: "the raw body, HMAC-SHA256 with the webhook secret, hex" };
      },
    },
    slack: {
      label: "Slack",
      header: "X-Slack-Signature",
      async check(e, secret) {
        const h = header(e, "x-slack-signature");
        const ts = header(e, "x-slack-request-timestamp");
        if (!h || !ts) return { ok: false, why: "Needs both X-Slack-Signature and X-Slack-Request-Timestamp." };
        const mac = `v0=${hex(await hmac(enc.encode(secret), concat(enc.encode(`v0:${ts}:`), bodyBytes(e))))}`;
        return { ok: h === mac, expected: mac, got: h, signed: "v0:{timestamp}:{raw body}, HMAC-SHA256 with the signing secret, hex", note: ageNote(ts, e) };
      },
    },
    shopify: {
      label: "Shopify",
      header: "X-Shopify-Hmac-Sha256",
      async check(e, secret) {
        const h = header(e, "x-shopify-hmac-sha256");
        if (!h) return { ok: false, why: "No X-Shopify-Hmac-Sha256 header on this request." };
        const mac = b64(await hmac(enc.encode(secret), bodyBytes(e)));
        return { ok: h === mac, expected: mac, got: h, signed: "the raw body, HMAC-SHA256 with the app's client secret, base64" };
      },
    },
    standard: {
      label: "Standard Webhooks",
      header: "webhook-signature",
      async check(e, secret) {
        const id = header(e, "webhook-id");
        const ts = header(e, "webhook-timestamp");
        const h = header(e, "webhook-signature");
        if (!id || !ts || !h) return { ok: false, why: "Needs webhook-id, webhook-timestamp and webhook-signature." };
        let key;
        try { key = unb64(secret.replace(/^whsec_/, "")); } catch (err) { return { ok: false, why: "The secret should be base64 after its whsec_ prefix." }; }
        const mac = b64(await hmac(key, concat(enc.encode(`${id}.${ts}.`), bodyBytes(e))));
        const sigs = h.split(" ").filter((s) => s.startsWith("v1,")).map((s) => s.slice(3));
        return { ok: sigs.includes(mac), expected: `v1,${mac}`, got: h, signed: "{id}.{timestamp}.{raw body}, HMAC-SHA256 with the base64-decoded secret, base64", note: ageNote(ts, e) };
      },
    },
  };

  function detectProvider(e) {
    for (const [k, p] of Object.entries(PROVIDERS)) if (header(e, p.header)) return k;
    return null;
  }

  async function checkSignature() {
    const out = $("[data-sig-out]");
    out.textContent = "";
    const e = entries.find((x) => x.id === selected);
    const raw = $("[data-sig-secret]").value;
    const secret = raw.trim();
    if (!e) return;
    if (secret && raw !== secret) out.append(el("p", "fineprint", "Spaces or line breaks around the secret were ignored. If your app reads the secret with them, its check will fail."));
    if (!secret) { out.append(el("p", "wt-sig-res is-bad", "Paste the signing secret first.")); return; }
    if (!(window.crypto && crypto.subtle)) { out.append(el("p", "wt-sig-res is-bad", "This browser has no Web Crypto API (it needs HTTPS).")); return; }
    if (e.truncated) out.append(el("p", "wt-sig-res is-bad", "This body was cut at 256 KiB, so its signature can't match."));
    const r = await PROVIDERS[$("[data-sig-provider]").value].check(e, secret);
    if (r.why) { out.append(el("p", "wt-sig-res is-bad", r.why)); return; }
    out.append(el("p", `wt-sig-res ${r.ok ? "is-ok" : "is-bad"}`, r.ok ? "✓ Valid signature. This request came from someone who holds that secret, and the body wasn't changed." : "✗ No match. Wrong secret, wrong scheme, or the body was changed after signing."));
    const dl = el("dl", "facts wt-sig-facts");
    const row = (k, v) => { dl.append(el("dt", null, k), el("dd", "mono", v)); };
    row("Signed content", r.signed);
    row("Header says", r.got);
    row("Computed", r.expected);
    if (r.note) row("Timing", r.note);
    out.append(dl);
  }

  /* ---------- Samples ---------- */
  function renderSamples() {
    const sample = `curl -X POST ${bin.url} -H "Content-Type: application/json" -d '{"event":"test","id":1}'`;
    $("[data-curl-sample]").textContent = sample;
    const any = document.querySelector("[data-curl-any]");
    if (any) any.textContent = `curl -X POST "${bin.url}/orders" \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"order.created","id":42}'`;
  }

  /* ---------- Controls ---------- */
  async function setRespond() {
    if (!bin) return;
    try {
      const b = await api(`/api/bins/${bin.id}`, { method: "PATCH", body: JSON.stringify({ status: Number($("[data-respond-status]").value), delayMs: Number($("[data-respond-delay]").value) }) });
      bin.respond = b.respond;
      bin.expiresAt = b.expiresAt;
    } catch (e) { if (e.status === 404) expired(); }
  }
  $("[data-respond-status]").addEventListener("change", setRespond);
  $("[data-respond-delay]").addEventListener("change", setRespond);

  $("[data-copy-url]").addEventListener("click", async (ev) => {
    if (!bin) return;
    try { await navigator.clipboard.writeText(bin.url); } catch (e) { urlField.select(); document.execCommand("copy"); }
    const b = ev.currentTarget; b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500);
  });
  urlField.addEventListener("focus", () => urlField.select());

  $("[data-new-url]").addEventListener("click", () => {
    urlField.classList.remove("is-expired");
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    fresh();
  });

  $("[data-clear]").addEventListener("click", async () => {
    if (!bin) return;
    try { await api(`/api/bins/${bin.id}/requests`, { method: "DELETE" }); } catch (e) { if (e.status === 404) return expired(); }
    entries = []; selected = null; renderList(); renderDetail();
  });

  const SAMPLE = { id: "evt_test_0001", type: "order.created", created: 0, data: { order: { id: 42, total: 19.99, currency: "EUR", items: [{ sku: "MUG-01", qty: 2 }] } } };
  $("[data-send-test]").addEventListener("click", async () => {
    if (!bin) return;
    SAMPLE.created = Math.floor(Date.now() / 1000);
    await fetch(`${bin.url}/test`, { method: "POST", headers: { "content-type": "application/json", "x-sent-by": "webhook tester button" }, body: JSON.stringify(SAMPLE) }).catch(() => {});
  });

  $("[data-sig-check]").addEventListener("click", checkSignature);
  $("[data-sig-secret]").addEventListener("keydown", (e) => { if (e.key === "Enter") checkSignature(); });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && bin && dot.dataset.state !== "live" && !urlField.classList.contains("is-expired")) connect(); });

  load();
})();
