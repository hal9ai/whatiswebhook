/* whatiswebhook.com — the HMAC signature playground (Chapter 04).
   Computes the same signatures as /tester.js, in the browser, with Web Crypto.
   Everything the reader types is rendered with textContent, never as HTML. */
(() => {
  "use strict";
  const root = document.querySelector("[data-playground]");
  if (!root) return;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const enc = new TextEncoder();
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function hmac(keyBytes, data) {
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", key, data);
  }

  /* Each scheme says what gets signed, how the key is made, and what the
     header looks like. Same rules as PROVIDERS in /tester.js. */
  const SCHEMES = {
    stripe: {
      secret: "whsec_playground_3f9a1c7e",
      ts: true,
      parts: (v) => [[`${v.ts}.`, "pre"], [v.body, "body"]],
      key: (secret) => ({ bytes: enc.encode(secret), note: "The whole secret, whsec_ prefix included, as UTF-8 bytes" }),
      encode: hex,
      sigLabel: (sig) => `v1=${sig}`,
      headers: (v, sig) => [["Stripe-Signature", `t=${v.ts},v1=${sig}`]],
      shell: "hex",
    },
    github: {
      secret: "It's a Secret to Everybody",
      ts: false,
      parts: (v) => [[v.body, "body"]],
      key: (secret) => ({ bytes: enc.encode(secret), note: "The webhook secret as UTF-8 bytes" }),
      encode: hex,
      sigLabel: (sig) => `sha256=${sig}`,
      headers: (v, sig) => [["X-Hub-Signature-256", `sha256=${sig}`]],
      shell: "hex",
      example: { secret: "It's a Secret to Everybody", body: "Hello, World!", expected: "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17", source: "GitHub's docs" },
    },
    slack: {
      secret: "8f742231b10e8888abcd99yyyzzz85a5",
      ts: true,
      parts: (v) => [[`v0:${v.ts}:`, "pre"], [v.body, "body"]],
      key: (secret) => ({ bytes: enc.encode(secret), note: "The signing secret as UTF-8 bytes" }),
      encode: hex,
      sigLabel: (sig) => `v0=${sig}`,
      headers: (v, sig) => [["X-Slack-Request-Timestamp", v.ts], ["X-Slack-Signature", `v0=${sig}`]],
      shell: "hex",
      example: {
        secret: "8f742231b10e8888abcd99yyyzzz85a5",
        ts: "1531420618",
        body: "token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c",
        expected: "a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503",
        source: "Slack's docs",
      },
    },
    shopify: {
      secret: "my-app-client-secret",
      ts: false,
      parts: (v) => [[v.body, "body"]],
      key: (secret) => ({ bytes: enc.encode(secret), note: "The app's client secret as UTF-8 bytes" }),
      encode: b64,
      sigLabel: (sig) => sig,
      headers: (v, sig) => [["X-Shopify-Hmac-Sha256", sig]],
      shell: "base64",
    },
    standard: {
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      ts: true,
      id: true,
      parts: (v) => [[`${v.id}.${v.ts}.`, "pre"], [v.body, "body"]],
      key(secret) {
        let bytes;
        try { bytes = unb64(secret.replace(/^whsec_/, "")); } catch (e) { return { error: "After whsec_, the secret must be base64. This one isn't, so there is no key." }; }
        if (!bytes.length) return { error: "The secret is empty after whsec_." };
        return { bytes, note: `Base64-decoded text after whsec_: ${bytes.length} bytes${bytes.length < 24 || bytes.length > 64 ? " (the spec asks for 24 to 64)" : ""}` };
      },
      encode: b64,
      sigLabel: (sig) => `v1,${sig}`,
      headers: (v, sig) => [["webhook-id", v.id], ["webhook-timestamp", v.ts], ["webhook-signature", `v1,${sig}`]],
      shell: "hexkey",
      example: {
        secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
        id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
        ts: "1614265330",
        body: "{\"test\": 2432232314}",
        expected: "g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
        source: "the reference library's tests",
      },
    },
  };

  const ui = {
    schemes: $$("[data-scheme]"),
    secret: $("[data-pg-secret]"),
    ts: $("[data-pg-ts]"),
    tsRow: $("[data-pg-ts-row]"),
    now: $("[data-pg-now]"),
    id: $("[data-pg-id]"),
    idRow: $("[data-pg-id-row]"),
    body: $("[data-pg-body]"),
    note: $("[data-pg-note]"),
    signed: $("[data-pg-signed]"),
    size: $("[data-pg-size]"),
    key: $("[data-pg-key]"),
    sent: $("[data-pg-sent]"),
    got: $("[data-pg-got]"),
    verdict: $("[data-pg-verdict]"),
    age: $("[data-pg-age]"),
    example: $("[data-pg-example]"),
    exampleOut: $("[data-pg-example-out]"),
    cmd: $("[data-pg-cmd]"),
  };

  const nowTs = () => String(Math.floor(Date.now() / 1000));
  let scheme = "stripe";
  const secrets = Object.fromEntries(Object.entries(SCHEMES).map(([k, s]) => [k, s.secret]));
  let pinned = null;   // what the sender signed: { sig, headers, values }
  let example = null;  // the docs example currently loaded, if any
  let run = 0;
  let pinRun = 0;

  if (!(window.crypto && crypto.subtle)) {
    ui.verdict.className = "pg-verdict is-bad";
    ui.verdict.textContent = "This browser has no Web Crypto API here (it needs HTTPS), so the playground can't compute signatures.";
    root.classList.add("is-off");
    return;
  }

  const values = () => ({ secret: ui.secret.value, ts: ui.ts.value, id: ui.id.value, body: ui.body.value });

  async function compute(v, name = scheme) {
    const s = SCHEMES[name];
    const k = s.key(v.secret);
    const parts = s.parts(v);
    const content = parts.map(([t]) => t).join("");
    const bytes = enc.encode(content);
    if (k.error) return { s, k, parts, bytes, content };
    const sig = s.encode(await hmac(k.bytes, bytes));
    return { s, k, parts, bytes, content, sig };
  }

  /* Show line breaks and tabs, which are otherwise invisible. */
  function appendVisible(parent, text, cls) {
    const span = el("span", cls);
    const re = /(\r\n|\n|\r|\t)/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) span.append(text.slice(last, m.index));
      const mark = { "\t": "→\t", "\r": "␍", "\n": "↵", "\r\n": "␍↵" }[m[0]];
      span.append(el("span", "pg-ws", mark));
      if (m[0] !== "\t") span.append("\n");
      last = m.index + m[0].length;
    }
    if (last < text.length) span.append(text.slice(last));
    parent.append(span);
  }

  function renderHeaders(node, headers) {
    node.textContent = "";
    headers.forEach(([k, v], i) => {
      if (i) node.append("\n");
      node.append(el("span", "pg-hk", `${k}: `));
      node.append(v);
    });
  }

  function renderDiff(node, label, sig, base) {
    node.textContent = "";
    const prefixLen = label.length - sig.length;
    node.append(label.slice(0, prefixLen));
    let changed = 0;
    for (let i = 0; i < sig.length; i++) {
      const same = base && sig[i] === base[i];
      if (!same) changed += 1;
      if (same || !base) node.append(sig[i]);
      else node.append(el("mark", "pg-diff", sig[i]));
    }
    return changed;
  }

  /* Shell quoting for the "check it yourself" command. */
  function shq(s) {
    if (/[\n\r\t]/.test(s)) return `$'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}'`;
    return `'${s.replace(/'/g, `'\\''`)}'`;
  }
  function shellFor(r, v) {
    const feed = `printf '%s' ${shq(r.content)} | `;
    if (r.s.shell === "hex") return `${feed}openssl dgst -sha256 -hmac ${shq(v.secret)}`;
    if (r.s.shell === "base64") return `${feed}openssl dgst -sha256 -hmac ${shq(v.secret)} -binary | base64`;
    return `${feed}openssl dgst -sha256 -mac HMAC -macopt hexkey:${hex(r.k.bytes)} -binary | base64`;
  }

  function renderAge() {
    const s = SCHEMES[scheme];
    if (!s.ts) { ui.age.textContent = ""; ui.age.hidden = true; return; }
    ui.age.hidden = false;
    const ts = Number(ui.ts.value);
    if (!/^\d+$/.test(ui.ts.value)) { ui.age.textContent = "Not a Unix timestamp in seconds: a receiver can't check its age and should reject it."; ui.age.dataset.state = "bad"; return; }
    const age = Math.round(Date.now() / 1000 - ts);
    const inside = Math.abs(age) <= 300;
    const a = Math.abs(age);
    const span = a < 120 ? `${a} s` : a < 7200 ? `${Math.round(a / 60)} min` : a < 172800 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400).toLocaleString("en-US")} days`;
    const when = age >= 0 ? `${span} ago` : `${span} in the future`;
    ui.age.textContent = `Signed ${when}. ${inside ? "Inside the usual 5-minute window." : "Outside the 5-minute window: libraries reject it even with a valid signature."}`;
    ui.age.dataset.state = inside ? "ok" : "bad";
  }

  async function render() {
    const mine = ++run;
    const v = values();
    const s = SCHEMES[scheme];
    ui.tsRow.hidden = !s.ts;
    ui.idRow.hidden = !s.id;
    ui.example.hidden = !s.example;
    renderAge();
    const r = await compute(v);
    if (mine !== run) return;

    ui.signed.textContent = "";
    r.parts.forEach(([text, kind]) => appendVisible(ui.signed, text, `pg-part-${kind}`));
    if (!r.content) ui.signed.append(el("span", "pg-ws", "(empty)"));
    ui.size.textContent = `${r.bytes.length.toLocaleString("en-US")} byte${r.bytes.length === 1 ? "" : "s"}`;

    if (r.k.error) {
      ui.key.textContent = r.k.error;
      ui.key.classList.add("is-bad");
      ui.got.textContent = "—";
      ui.verdict.className = "pg-verdict is-bad";
      ui.verdict.textContent = "✗ No key, no signature. Check the secret's format.";
      ui.cmd.textContent = "";
      ui.exampleOut.textContent = "";
      return;
    }
    ui.key.classList.remove("is-bad");
    ui.key.textContent = r.k.note;

    if (!pinned) { ui.sent.textContent = "…"; ui.got.textContent = "…"; ui.verdict.className = "pg-verdict"; ui.verdict.textContent = ""; return; }
    if (!pinned.sig) {
      ui.sent.textContent = "(nothing: the secret wasn't valid when the sender signed)";
      ui.got.textContent = s.sigLabel(r.sig);
      ui.verdict.className = "pg-verdict is-bad";
      ui.verdict.textContent = "✗ The sender had no valid key. Fix the secret, then sign again.";
      ui.cmd.textContent = shellFor(r, v);
      ui.exampleOut.textContent = "";
      return;
    }
    renderHeaders(ui.sent, pinned.headers);
    const changed = renderDiff(ui.got, s.sigLabel(r.sig), r.sig, pinned.sig);
    const ok = changed === 0;
    ui.verdict.className = `pg-verdict ${ok ? "is-ok" : "is-bad"}`;
    ui.verdict.textContent = ok
      ? "✓ Match. The receiver accepts it: same secret, same bytes."
      : `✗ No match: ${changed} of ${r.sig.length} characters differ. The receiver rejects it.`;
    ui.cmd.textContent = shellFor(r, v);

    if (example && s.example === example) {
      const same = r.sig === example.expected;
      ui.exampleOut.textContent = same
        ? `✓ Same value as ${example.source}: ${s.sigLabel(example.expected)}`
        : `${example.source} expect ${s.sigLabel(example.expected)}. You've changed an input since.`;
      ui.exampleOut.dataset.state = same ? "ok" : "off";
    } else {
      ui.exampleOut.textContent = "";
    }
  }

  /* Freeze what the sender signs: the inputs as they are right now. */
  async function pin() {
    const mine = ++pinRun;
    const v = values();
    const name = scheme;
    pinned = null;
    render();
    const r = await compute(v, name);
    if (mine !== pinRun || name !== scheme) return;
    pinned = { sig: r.sig || null, headers: r.sig ? SCHEMES[name].headers(v, r.sig) : [], values: v };
    render();
  }

  function setScheme(name) {
    secrets[scheme] = ui.secret.value;
    scheme = name;
    example = null;
    ui.schemes.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.scheme === name)));
    ui.secret.value = secrets[name];
    ui.note.textContent = "";
    pin();
  }

  /* One-byte changes, the way tools and frameworks make them. */
  const TAMPER = {
    space(body) { const i = body.indexOf(":"); return i >= 0 ? `${body.slice(0, i + 1)} ${body.slice(i + 1)}` : `${body} `; },
    newline: (body) => `${body}\n`,
    reorder(body) {
      const o = JSON.parse(body);
      if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not an object");
      const keys = Object.keys(o);
      if (keys.length < 2) throw new Error("one key");
      return JSON.stringify(Object.fromEntries(keys.reverse().map((k) => [k, o[k]])));
    },
    pretty: (body) => JSON.stringify(JSON.parse(body), null, 2),
  };

  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || !root.contains(b)) return;
    if (b.dataset.scheme) return setScheme(b.dataset.scheme);
    if (b.hasAttribute("data-pg-sign")) { ui.note.textContent = "Signed again: the sender's header now matches these exact bytes."; return pin(); }
    if (b.hasAttribute("data-pg-reset")) {
      if (pinned) { const p = pinned.values; ui.secret.value = p.secret; ui.ts.value = p.ts; ui.id.value = p.id; ui.body.value = p.body; }
      ui.note.textContent = "Back to exactly what the sender signed.";
      return render();
    }
    if (b.hasAttribute("data-pg-now")) { ui.ts.value = nowTs(); ui.note.textContent = "New timestamp. It's part of the signed content, so the old header no longer fits."; return render(); }
    if (b.hasAttribute("data-pg-example")) {
      const ex = SCHEMES[scheme].example;
      if (!ex) return;
      example = ex;
      ui.secret.value = ex.secret;
      ui.body.value = ex.body;
      if (ex.ts) ui.ts.value = ex.ts;
      if (ex.id) ui.id.value = ex.id;
      ui.note.textContent = `Loaded the example from ${ex.source}.`;
      return pin();
    }
    const t = b.dataset.tamper;
    if (t) {
      try {
        const next = TAMPER[t](ui.body.value);
        ui.body.value = next;
        ui.note.textContent = { space: "Added one space.", newline: "Added a line break at the end, as many editors and tools do.", reorder: "Same JSON data, keys in a different order.", pretty: "Same JSON data, re-serialized with indentation." }[t];
      } catch (e) {
        ui.note.textContent = t === "reorder" ? "That one needs a JSON object with at least two keys in the body." : "That one needs JSON in the body.";
      }
      render();
    }
  });

  ["input", "change"].forEach((type) => {
    ui.secret.addEventListener(type, render);
    ui.ts.addEventListener(type, render);
    ui.id.addEventListener(type, render);
    ui.body.addEventListener(type, render);
  });

  ui.ts.value = nowTs();
  setInterval(renderAge, 1000);
  root.classList.add("is-live");
  pin();
})();
